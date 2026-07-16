"""Renders the balance report: per-strategy cash/car-count distributions
at checkpoint days, as a markdown table - answers "what does day 40 look
like for a flipper?" with real numbers (Sprint 03 DoD).
"""

import argparse
import sys
from pathlib import Path

import polars as pl

from balance.data import (
    load_acquisitions,
    load_auction_wins,
    load_careers,
    load_coherence,
    load_donor_coherence,
    load_donor_coherence_manifest,
    load_symptom_coherence,
    load_symptom_coherence_manifest,
)
from balance.invariants import COMPETENT_POLICY_STRATEGY, days_to_tier, percentile

CHECKPOINT_DAYS = [25, 40, 70, 100]


def summarize(df: pl.DataFrame) -> pl.DataFrame:
    checkpoints = df.filter(pl.col("day").is_in(CHECKPOINT_DAYS))
    return (
        checkpoints.group_by(["strategy", "day"])
        .agg(
            pl.col("cashYen").median().alias("cashYen_median"),
            pl.col("cashYen").quantile(0.1).alias("cashYen_p10"),
            pl.col("cashYen").quantile(0.9).alias("cashYen_p90"),
            pl.col("carsOwned").median().alias("carsOwned_median"),
            pl.col("reputationPoints").median().alias("reputationPoints_median"),
        )
        .sort(["strategy", "day"])
    )


BUCKET_TARGETS = {"steal": (0.10, 0.25), "mid": (0.50, 1.00), "frenzy": (0.05, 0.15)}


def summarize_auction_wins(df: pl.DataFrame) -> pl.DataFrame:
    """Sprint 20 (auction rework II): bucket share of the hammer price as a
    fraction of the lot's own anchorValueYen - the wholesale-anchored
    clearing calibration target, checked against real bot play rather than
    only the unit-level formula tests."""
    total = df.height
    counts = df.group_by("bucket").agg(pl.len().alias("count")).sort("bucket")
    return counts.with_columns((pl.col("count") / total).alias("share")) if total else counts


def render_auction_section(bucket_summary: pl.DataFrame) -> list[str]:
    """Basis (Sprint 20): fraction = hammer price / anchorValueYen (the best
    interested buyer's valuation of the rolled car) - steal < 0.65, mid
    0.65-0.9, frenzy > 0.9. Replaces the Sprint 10 [reserve, buyout]-fraction
    basis, which stopped meaning anything once buyout re-pointed at the
    value anchor and reserve stopped bounding real outcomes."""
    lines = [
        "## Auction calibration (Sprint 20, auction rework II)",
        "",
        "Hammer price as a fraction of anchorValueYen, bucketed, across every lot a bot "
        "bid on and lost or won (see `auctionWins.manifest.json` for the run size). "
        "steal < 0.65, mid 0.65-0.9, frenzy > 0.9. "
        "Target: steal 10-25% (patient bidding beating buyout most of the time), "
        "mid the majority, frenzy 5-15%.",
        "",
        "| Bucket | Share | Target |",
        "|---|---|---|",
    ]
    shares = {row["bucket"]: row["share"] for row in bucket_summary.iter_rows(named=True)}
    for bucket, (lo, hi) in BUCKET_TARGETS.items():
        share = shares.get(bucket, 0.0)
        lines.append(f"| {bucket} | {share:.1%} | {lo:.0%}-{hi:.0%} |")
    lines.append("")
    return lines


def summarize_acquisitions(df: pl.DataFrame) -> pl.DataFrame:
    """External review 2026-07 finding 2: fraction of acquisitions made via
    instant buyout vs. a won competitive bid, per strategy - if a strategy
    converges on always-buyout, the bidding screen is dead for it and
    AUCTION_BUYOUT_PREMIUM needs to hurt more."""
    if df.height == 0:
        return df
    return (
        df.group_by(["strategy", "channel"])
        .agg(pl.len().alias("count"))
        .with_columns(
            (pl.col("count") / pl.col("count").sum().over("strategy")).alias("share"),
        )
        .sort(["strategy", "channel"])
    )


def render_acquisitions_section(acquisitions_summary: pl.DataFrame) -> list[str]:
    lines = [
        "## Buyout vs. bid (external review 2026-07, finding 2)",
        "",
        "Share of successful auction acquisitions made via instant buyout vs. a won "
        "competitive bid, per strategy. A strategy near 100% buyout means the bidding "
        "screen is effectively dead for it and `AUCTION_BUYOUT_PREMIUM` (currently a "
        "25% premium over the value anchor, Sprint 20) is cheap enough that certainty "
        "always wins. Bots never buy out as of Sprint 20 (buyout is a player-impatience "
        "valve only), so this section's bot-side numbers are expected to read as 0% "
        "buyout going forward - kept for the player-side telemetry hook and as a "
        "regression check that bots really have stopped buying out.",
        "",
        "| Strategy | Bid | Buyout |",
        "|---|---|---|",
    ]
    if acquisitions_summary.height == 0:
        lines.append("| *(no acquisitions this run)* | - | - |")
        lines.append("")
        return lines

    shares: dict[str, dict[str, float]] = {}
    for row in acquisitions_summary.iter_rows(named=True):
        shares.setdefault(row["strategy"], {})[row["channel"]] = row["share"]
    for strategy in sorted(shares):
        bid = shares[strategy].get("bid", 0.0)
        buyout = shares[strategy].get("buyout", 0.0)
        lines.append(f"| {strategy} | {bid:.1%} | {buyout:.1%} |")
    lines.append("")
    return lines


def render_days_to_tier_section(df: pl.DataFrame) -> list[str]:
    """Sprint 23: days-to-tier percentiles for the `competent-policy` probe -
    the reputation-pacing claim invariant 3 gates on `local`'s p50 alone;
    this table shows the full picture (including the two tiers sprint23.md's
    pacing table targets but doesn't hard-gate)."""
    lines = [
        "## Days-to-tier (Sprint 23, competent-policy probe)",
        "",
        "First day each seeded `competent-policy` career reaches each reputation tier "
        "or better. `local` (p50 in [10, 35]) is the only hard-gated row (invariant 3); "
        "`known`/`respected` are informational against sprint23.md's own pacing targets "
        "(day 50-70 and day 90-120 respectively).",
        "",
        "| Tier | Reached | p10 | p50 | p90 |",
        "|---|---|---|---|---|",
    ]
    total_seeds = df.filter(pl.col("strategy") == COMPETENT_POLICY_STRATEGY)["seed"].n_unique()
    for tier in ("local", "known", "respected"):
        days = days_to_tier(df, tier)
        if days.len() == 0:
            lines.append(f"| {tier} | 0/{total_seeds} | - | - | - |")
            continue
        lines.append(
            f"| {tier} | {days.len()}/{total_seeds} "
            f"| {percentile(days, 0.1):.0f} | {percentile(days, 0.5):.0f} "
            f"| {percentile(days, 0.9):.0f} |"
        )
    lines.append("")
    return lines


def render_specialty_section(df: pl.DataFrame) -> list[str]:
    """Sprint 38 (specialty axis), informational only - no invariant reads
    this yet. Day-100 top-specialty group (most common across seeds) and its
    median point value per strategy, from `specialtyTopGroup`/
    `specialtyTopPoints` (exportCareers.ts) - exists so the arc-end balance
    pass can see whether the offer-bias/in-lane-premium mechanics actually
    produce real specialization, not to gate anything yet."""
    lines = [
        "## Specialty (Sprint 38, informational)",
        "",
        "Day-100 top specialty group (most common across seeds) and its median point "
        "value, per strategy. `engine`/0 means the strategy never earned any (the "
        "argmax default).",
        "",
        "| Strategy | Most common top group | Points (median) |",
        "|---|---|---|",
    ]
    if "specialtyTopGroup" not in df.columns or df.height == 0:
        lines.append("| *(no specialty data in this run)* | - | - |")
        lines.append("")
        return lines

    day100 = df.filter(pl.col("day") == 100)
    for strategy in sorted(day100["strategy"].unique().to_list()):
        rows = day100.filter(pl.col("strategy") == strategy)
        if rows.height == 0:
            continue
        modes = rows["specialtyTopGroup"].mode().sort().to_list()
        top_group = modes[0] if modes else "-"
        points_median = rows["specialtyTopPoints"].median()
        lines.append(f"| {strategy} | {top_group} | {points_median:.1f} |")
    lines.append("")
    return lines


def render_coherence_section(coherence: pl.DataFrame) -> list[str]:
    """Sprint 55 (economy-bible.md law 4): the closed-form Law 1/Law 2/Law 3
    facts, per roster model - `computeRosterCoherence` (sim) derives every
    column by calling the real value/generation-guard functions directly, so
    this table can never drift from what the game itself does. The "whole
    roster's economy on one page" view the 2026-07-14 playtest (item 6)
    asked for."""
    lines = [
        "## Roster coherence (Sprint 55, economy-bible.md law 4)",
        "",
        "Per-model closed-form facts at the worst plausible roll (post Law-2 "
        "generation guard): clean value, the softened worst-case restoration "
        "bill and its ratio to clean value (must stay <= `maxBillFraction`), "
        "the flip margin buying at reserve + fully restoring TO MINT + selling "
        "at guide would clear (must stay positive), and the full "
        "consumable-replacement share of book value (must stay under the "
        "content cap).",
        "",
        "Read **Sensible margin** first (Sprint 66). Since Law 1 gained a "
        "per-tier expectation band, a full mint restore is no longer the play "
        "the economy asks for on a cheap car - the market barely discounts a "
        "worn kei, so you pay near clean value for one and the mint bill burns "
        "the margin. **Sensible margin** is the real core loop: buy rough "
        "(every slot `poor`) at reserve, repair up to the tier's expectation "
        "band and not a yen past, sell at the resulting guide. **Mint flip** "
        "stays gated as Law 2's literal claim (full restoration must always be "
        "*capable* of profit), but on the shitbox tier it correctly collapses.",
        "",
        "**Wage** (Law 6) is the value a repair returns over its own cost, less "
        "the rent accrued over the labour it takes, on a rough-but-fixable car "
        "at a fresh shop's tier-1 tools. It must stay positive on common/uncommon/"
        "rare models (gated); on the shitbox tier it is honestly negative once "
        "the full teardown chain is priced (Sprint 72), a disclosed gap, not a "
        "gate. The **xRent** "
        "ratio is the tuning dial: it is invariant to the target band (cost and "
        "labour both scale with grade count), and falls down the roster because "
        "repair labour is value-blind while the margin scales with part price.",
        "",
        "| Model | Class | Clean value | Worst bill | Ratio | Sensible margin | Mint flip "
        "| Wage | xRent | Consumables share |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    for row in coherence.sort("modelId").iter_rows(named=True):
        lines.append(
            f"| {row['modelId']} | {row['fitmentClass']} "
            f"| Y{row['cleanValueYen']:,.0f} | Y{row['worstBillYen']:,.0f} "
            f"| {row['billToCleanRatio']:.1%} "
            f"| Y{row['sensibleFlipMarginYen']:,.0f} "
            f"({row['sensibleFlipMarginFraction']:.1%}) "
            f"| Y{row['flipMarginYen']:,.0f} "
            f"| Y{row['wageMarginYen']:,.0f} | {row['wageRatio']:.2f}x "
            f"| {row['consumablesShare']:.1%} |"
        )
    lines.append("")
    return lines


def render_donor_coherence_section(
    donor_coherence: pl.DataFrame, coherence: pl.DataFrame, donor_break_even_bill_ratio: float
) -> list[str]:
    """Sprint 71 decision 8 (the teardown game's donor economy):
    `computeRosterDonorCoherence`'s closed-form whole-vs-parted facts, joined
    against the roster coherence table's own `billToCleanRatio`/
    `sensibleFlipMarginYen` so the crossover against
    `economy.teardown.donorBreakEvenBillRatio` reads on one line per model.
    Disclosure only (decision 8): the crossover is measured here, never
    force-gated to the ratio - see `coherence.test.ts` for the hard-gated
    "whole always beats parted" invariant this table's own numbers must
    satisfy on every row."""
    joined = donor_coherence.join(
        coherence.select("modelId", "billToCleanRatio", "sensibleFlipMarginYen"),
        on="modelId",
    )
    lines = [
        "## Donor coherence (Sprint 71 decision 8, the teardown game)",
        "",
        f"Whole-car sale value against parting out the same clean car (haircut "
        f"`economy.teardown.usedPartSaleFraction`, plus scrapping the stripped shell). "
        f"**Whole must always beat parted** - a clean car should never be worth more "
        f"destroyed for parts. **Parting wins?** measures the SEPARATE worst-case-car "
        f"question: does stripping the worst plausible generatable roll's still-good "
        f"parts (better than `poor`) beat that same model's sensible-repair margin - "
        f"disclosed against a {donor_break_even_bill_ratio:.0%} bill-to-clean "
        f"break-even, not force-gated to it.",
        "",
        "| Model | Whole sale | Parted yield | Strip labour | Bill/clean | Parting wins? |",
        "|---|---|---|---|---|---|",
    ]
    for row in joined.sort("modelId").iter_rows(named=True):
        parting_wins = row["partedYieldOfWorstCaseYen"] > row["sensibleFlipMarginYen"]
        lines.append(
            f"| {row['modelId']} | Y{row['wholeSaleYen']:,.0f} "
            f"| Y{row['partedYieldYen']:,.0f} | {row['stripLaborSlots']} slots "
            f"| {row['billToCleanRatio']:.1%} | {'yes' if parting_wins else 'no'} |"
        )
    lines.append("")
    return lines


def render_symptom_coherence_section(
    symptom_coherence: pl.DataFrame, fear_premium: float
) -> list[str]:
    """Sprint 73 decision 6 (diagnosis I, the blind-buy guardrail):
    `computeSymptomCoherence`'s closed-form edge table, one row per symptom x
    fitment tier, causes collapsed onto one line each. Disclosure, not a
    gate here - `coherence.test.ts` hard-gates `blindBuyEvYen` staying in
    [0, 20% of the apparent-to-expected gap] and every symptom showing both
    a sleeper and a trap cause, on every tier, for the real shipped content;
    this table is the human-readable render of the exact same numbers."""
    lines = [
        "## Symptom coherence (Sprint 73 decision 6, the blind-buy guardrail)",
        "",
        f"Per symptom x fitment tier, on a clean representative car: the apparent "
        f"(room-shown) value, the honest expected true value, the fear-priced sheet "
        f"value the room actually charges (`fearPremium` {fear_premium:.2f}), and the "
        f"blind-buy edge (`expectedTrueValueYen - sheetGuideValueYen`) - buying with no "
        f"test run at all must never be a losing bet on average, and never a windfall "
        f"either. **Causes** lists each cause's own edge if it turns out true "
        f"(positive = the car is worth more than the sheet charged; negative = less) - "
        f"every symptom must show at least one of each, on every tier.",
        "",
        "| Symptom | Tier | Apparent | Expected true | Sheet guide | Blind-buy EV | Causes |",
        "|---|---|---|---|---|---|---|",
    ]
    grouped = symptom_coherence.group_by(["symptomId", "fitmentClass"], maintain_order=True).agg(
        pl.col("apparentValueYen").first(),
        pl.col("expectedTrueValueYen").first(),
        pl.col("sheetGuideValueYen").first(),
        pl.col("blindBuyEvYen").first(),
        pl.col("causeId"),
        pl.col("edgeYen"),
    )
    for row in grouped.sort(["symptomId", "fitmentClass"]).iter_rows(named=True):
        causes = "; ".join(
            f"{cause_id} {edge:+,.0f}" for cause_id, edge in zip(row["causeId"], row["edgeYen"])
        )
        lines.append(
            f"| {row['symptomId']} | {row['fitmentClass']} "
            f"| Y{row['apparentValueYen']:,.0f} | Y{row['expectedTrueValueYen']:,.0f} "
            f"| Y{row['sheetGuideValueYen']:,.0f} | Y{row['blindBuyEvYen']:,.0f} "
            f"| {causes} |"
        )
    lines.append("")
    return lines


INVARIANTS_ENFORCED_SECTION = [
    "## Invariants enforced (Sprint 23 decision 7, Sprint 55 decision 2)",
    "",
    "`balance.cli check` hard-gates 11 checks against this data: days-to-`local` p50 "
    "in [10, 35] (competent-policy probe), buyout share of acquisitions < 30%, the "
    "3 legacy Sprint 03/09 checks (Passive Grinder solvency, Flipper-vs-Passive "
    "separation, sanity floor), and 6 roster-coherence checks (economy-bible.md "
    "law 4, Sprints 55, 66, and 72): every model's worst-case bill-to-clean ratio <= "
    "`maxBillFraction` (law 2), every model's flip margin at the worst roll is positive "
    "(law 1), every model's SENSIBLE-play margin is positive (law 1 as amended, Sprint 66), "
    "every COMMON/UNCOMMON/RARE model's repair wage beats the rent over the labour it "
    "takes (law 6, Sprint 66; the shitbox tier is measured separately below, Sprint 72), "
    "every model's full "
    "consumable-replacement share of book value <= the content cap (law 3), and the "
    "service-job payout margin floor clears the profitability invariant's required "
    "coverage (law 4 - the full per-template/per-model proof is `serviceJobPayout.test.ts`, "
    "already gated in the standard test suite). 4 more are measured and reported but NOT "
    "gated (kept informational rather than promoted, since no maintainer has signed off on "
    "hard-gating them yet) - see `invariants.py`'s module docstring for their history. "
    "The first 3 currently read BADLY, and deliberately so: as of Sprint 66 most strategies "
    "lose money (Flipper is well below its own starting cash) and the auction tail is "
    "frenzy-dominant. Do not tune the economy against those figures. They measure BOT "
    "behaviour, and the bots restore every car to mint - which economy-bible law 1, as "
    "amended in Sprint 66, now correctly punishes on a cheap car. The closed-form "
    "coherence table above is bot-free and proves the same cars clear a healthy margin "
    "on the play the economy actually asks for. The bots needing a rework to play the "
    "real game is a known, recorded defect (`TODO.md`), not an economy failure - see "
    "`docs/sprints/sprint66.md`'s Exit. The 4th (Sprint 72): honestly pricing a "
    "non-surface repair's full teardown chain surfaces a genuine shitbox-tier law 6 "
    "loss (cheap parts return too little repair gain to outearn the rent the teardown "
    "labour burns) - measured and disclosed, not silently loosened, pending a maintainer "
    "economy-tuning decision (`TODO.md`).",
    "",
]


def render_markdown(
    summary: pl.DataFrame,
    auction_section: list[str],
    acquisitions_section: list[str],
    days_to_tier_section: list[str],
    specialty_section: list[str],
    coherence_section: list[str],
    donor_coherence_section: list[str],
    symptom_coherence_section: list[str],
) -> str:
    lines = [
        "# Midnight Garage - Balance Report",
        "",
        "One row per strategy per checkpoint day, across every seeded career "
        "(see `careers.manifest.json` for the run size).",
        "",
        "| Strategy | Day | Cash (p10) | Cash (median) | Cash (p90) | Cars owned (median) "
        "| Reputation pts (median) |",
        "|---|---|---|---|---|---|---|",
    ]
    for row in summary.iter_rows(named=True):
        lines.append(
            f"| {row['strategy']} | {row['day']} "
            f"| Y{row['cashYen_p10']:,.0f} | Y{row['cashYen_median']:,.0f} | Y{row['cashYen_p90']:,.0f} "
            f"| {row['carsOwned_median']:.1f} | {row['reputationPoints_median']:.1f} |"
        )
    lines.append("")
    lines.extend(days_to_tier_section)
    lines.extend(specialty_section)
    lines.extend(coherence_section)
    lines.extend(donor_coherence_section)
    lines.extend(symptom_coherence_section)
    lines.extend(auction_section)
    lines.extend(acquisitions_section)
    lines.extend(INVARIANTS_ENFORCED_SECTION)
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", default="tools/balance/data")
    parser.add_argument("--out", default="tools/balance/report.md")
    args = parser.parse_args(argv)

    data_dir = Path(args.data_dir)
    df = load_careers(data_dir)
    auction_wins = load_auction_wins(data_dir)
    acquisitions = load_acquisitions(data_dir)

    coherence = load_coherence(data_dir)
    donor_coherence = load_donor_coherence(data_dir)
    donor_coherence_manifest = load_donor_coherence_manifest(data_dir)
    symptom_coherence = load_symptom_coherence(data_dir)
    symptom_coherence_manifest = load_symptom_coherence_manifest(data_dir)

    auction_section = render_auction_section(summarize_auction_wins(auction_wins))
    acquisitions_section = render_acquisitions_section(summarize_acquisitions(acquisitions))
    days_to_tier_section = render_days_to_tier_section(df)
    specialty_section = render_specialty_section(df)
    coherence_section = render_coherence_section(coherence)
    donor_coherence_section = render_donor_coherence_section(
        donor_coherence, coherence, donor_coherence_manifest["donorBreakEvenBillRatio"]
    )
    symptom_coherence_section = render_symptom_coherence_section(
        symptom_coherence, symptom_coherence_manifest["fearPremium"]
    )
    report = render_markdown(
        summarize(df),
        auction_section,
        acquisitions_section,
        days_to_tier_section,
        specialty_section,
        coherence_section,
        donor_coherence_section,
        symptom_coherence_section,
    )
    Path(args.out).write_text(report, encoding="utf-8")
    print(report)
    return 0


if __name__ == "__main__":
    sys.exit(main())
