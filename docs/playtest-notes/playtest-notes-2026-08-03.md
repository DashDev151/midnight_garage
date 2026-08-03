# Playtest notes, 2026-08-03

**Raw maintainer notes, transcribed verbatim.** Nothing here is triaged, verified or actioned in
this file. Findings that survive verification become sprints; this document stays as the record of
what was actually seen.

**Timing caveat, stated by the maintainer:** every note above the marked line was taken BEFORE the
paint rework (Sprints 169-170) landed. Anything about consumables applies to paint too.

---

## Auction access

> The permit behind the till covers any auction house in town. Getting through their doors is
> another matter: the bigger rooms want a member to vouch for you.
>
> Tutorial - not relevant in tutorial now. Needs to be covered later in the game.

## Tutorial highlight

> In the tutorial, where we are highlighting the next button with a faint blue outline, we should
> add a very subtle slow pulse to the outline to make it easier to see.

## The tutorial car's inspection: incoherent and too low stakes

> Just lifters: the cheap kind of tick, the kind a quiet afternoon and a set of shims can cure. The
> room is still scared of it, and their fear is our discount.
>
> The car is going from 185445 to 186402 in value. doubt, resolved, is 3505. First I dont understand
> the maths, second, this is extremely low stakes.... basically nothing. And the entire second step
> of the diagnosis we are left with 2 options, both cheap, and we are releaved that it is the more
> expensive one. even though we have already rules out the grenade earlier...
>
> This whole thing is incoherent, and even if it was coherent its too low stakes. YOu need to do a
> better job at authoring the tutorial car's inspection process.

## Tutorial car mileage

> Also, the car is a 1994 model with 96000 km. was it driven to the moon?

## Copy edit needed

> Oh, that one! I know she's scruffy, but look at her. There's a good little car under all that dirt,
> I can feel it from here. - existing note buit needs a copy edit after we changed the general
> condition of the cheaper cars.

## The stats radar is broken

> The stats radar is completely broken.
> why is power reading 50 but displaying at the low end.
> Authenticity lable getting cut off
> Handling is 0 - is that because the tyres are scrap?
> Style is 14, is that right? Is that the correct base style?

## The service diagram is broken

> The Service diagram view is now broken since we changed the zones. We now have a left front / back
> and right front / back and no more chassis body zone. So the service diagram needs to be fixed.
> Bonnet, roof, boot look broken too.

## Tutorial: the parts buying step

> The parts buying step needs more help in the tutorial. Need to show the user how to use the fits
> this vehicle dropdown, and also highlight the cart actions of selecting express delivery and
> placing order.

## Tutorial: the teardown instruction is too wordy

> Now for that tick, and this one is proper surgery. It lives in the Head & Valvetrain, deep in the
> engine, and the engine will not come out with the Intake, the Exhaust and the Cooling bolted on
> around it. Click each of those three in the Engine bay view and press Take it off; the button
> tells you what each one takes off the labour bar, and they wait safely in your inventory.
>
> Need clearer, less wordy instructions here. Do not just list the 3 components, make them a bullet
> list that gets ticked off as each is removed.

## Service diagram art: deferred, deliberately

> On the service diagram itself. It is definitely a big improvement on version one. We will do it
> properly later, but this is good for a temporary stand in. Later we will do proper art and
> interactive sprites and highlighting etc. Just note it as a deferred action.

## Tutorial overall

> Tutorial in general - Decently good flow, decent length. Just minor fixes then it is good enough
> for now.

## Tutorial pricing reads as wrong even though it reconciles

> ON the tutorial Priceing...
> While I know the math is correct and it reconciles, it READS as if it is incorrect.
> 142k payout
> 26,3k pprofit
> though starting cash was 300k and the player now has 306,3k
>
> I know the delta is the running costs of hiring the workshop tools (and express delivery), but a
> brand new player will not know that unless we make it clear and transparent in a way. the awnser is
> not to bill running costs against a single car, but perhaps after every sale or somewhere prominent
> we should be displaying the total running costs for the week so far... So that the player can see
> oh okay i technically made 26k on that car if you just consider the buy price and repair costs...
> but it cost me a lot to get it fiixed... I should probably work on getting my own tools.. makes
> sense? Its just a display issue not a maths issue. Okay - I See that we already have a cost tab.
> Thats great. Its basically waht we need already, we just need to properly steer the player to it so
> that they undestand the discrepancy.

## The handoff from tutorial to open play is too vague

> That is the walkthrough done, and your first happy customer on the road. From tomorrow the phone
> starts ringing; do good work and the town will find its way to your door. - this is too vague. We
> need to give the player more guidance in transitioning from tutorial to open play.

## Bays: forecourt and parking should be one thing

> Fourcourt: Im not sure i like the idea of having service bays, parking bays AND forecourt bays.
> parking bays and forecourt bays need to be the same thing

## The specialty system is broken

> After the tutorial, my Body Speciality is at 15/120. We did not do body work. We did tyre work and
> engine work, both still at 0. This is completely broken. The whole speciality system needs to be
> looked at.

## Body parts in the store

> Okay, now Body Parts in the store:
> We have each body panel in stock grade in the store available. bonnet, boot etc but
> 1. We are still selling Left panel set in stead of Left front and Right Front
> 2. The aftermarket body panels are a mess. We are going from waht should be 7 parts, to one, just a
>    body kit... The aftermarket body parts should have the same schema as the stock body parts. Just
>    like every other part in the game.
> 3. We have an ommition, which does not really matter for stock parts but definitely does for
>    aftermarket. Bunpers and sideskirts. How are we handling these? Need cleanup and additional
>    design work here.

## Consumables should be bought and stocked, not auto-charged

> note for later: Paint should be a consumable that you buy and use up like putty.
>
> "Charged into a stage's own cost line the moment you work it - never bought or stocked ahead of
> time." - Why? I wnat to buy body filler, sanding paper, primer, paint (different colors) underseal,
> polish etc. We shoould make these all purchasable parts in a consumables sub menu with all of them
> have set use rates (like a tin of putty can do 4 panels, a paint tin can do a whole car etc. That
> makes it much more interesting than just auto charging the player a set amount for work. Thats not
> fun its tax.

## Player inventory is bad

> Player inventory is bad. Its just a big list. It needs structure. needs a "part comes from" car
> selector, Needs proper slicers for part type, part condiftion,etc. also proper sorting, sort by
> pricwe, by car type, alphabetically, by condition. GOOD controls. Also dry violation with the
> inverntory tab as well as the inventory popup in the car repair screen. Needs to be the same, well
> structured, actually usable system.

## CRITICAL BUG: cannot refit the engine assembly

> CRITICAL BUG: I cn not refit the engine assembly, even though all 4 parts have been fitted and I
> have the crane for the day. the refit assembly button does nothing. It this is because I did not
> have enough labour available, then the bug is that it is not made clear enough how much labor an
> action costs and hiow much labor they player has left.

## Labour needs rebalancing

> Secondly, labour in general:
> Labour needs to be rebalanced. It runs out too soon in a day. Lets keep the labour costs set, but
> increase the labour starting pool to 80
> Secondly, we need to add a way to add back labour without advancing the day. Like visiting a cafe
> and drinking a strong coffee. Adds back a little labour lets say 20, but costs yen

## Overworld map

> note for later: Overworld. I still want a map with physical locations for all our tabs. Like a top
> down representation of a small backstreet. Our garage, the tool hire shop, the parts shop, the
> accountant (financials) , the local yard, The regional auction a little further away, the touge
> route in the top near the mountains, the highway (and wangan test track) to the premium auction,
> the international raceway and collector network further out in the larger city... you get the idea.
> the player navigated by clicking on the locations on a map, not by clicking a tab.

---

## Notes taken after the paint rework

> NOTE: All notes above this point were made before the paint rework. Everything that talks about
> consumables being items in the shop that you buy and stock also goes for paint. It needs to follow
> a proper workflow.

## The main pages need a rework: TALK FIRST

> Then: Before you do anything here we need to talk and plan it first, but all of our main pages need
> a rework. We are moving away from jsut menu items, to building a physical world, with just block
> placeholders for now, but it will be physically rendered. Ask me about this first.
