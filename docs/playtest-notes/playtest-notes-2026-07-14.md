# Playtest notes - 2026-07-14 (maintainer, raw)

Third maintainer playtest pass. Raw notes transcribed as delivered; numbering preserved.
Screenshots referenced are described inline in brackets.

1. On the main menu we are doubling up on the title "Midnight Garage". We are showing it in
   both the main navigation bar as the main title and as the menu title. There are also 2 save
   buttons. Clean this page up.

2. For the auction lots: remove the condition summaries for engine, drivetrain, etc. We are
   ONLY displaying the number grade and the interior and exterior letter grades.

3. Make the number grade and the 2 letter grades look better. More like a graphic. Kind of
   like a stamp, with redder colors for bad grades and greener colors for good ones. Make it
   more of a feature.

4. Notice the size of the picture placeholder vs the rest of the card. The picture is the
   correct res, but I think we need to either scale that up or everything else down. Let's
   scale up the image placeholders 2X.

5. The entire auction card needs a visual redesign. I have included a VERY rough mockup of
   kinda the layout I want. Obviously it needs to fit our art style and themes etc, but the
   screenshot should give you a decent idea of how I want it structured.
   [Mockup: a two-panel card. Left panel: title line "Honda City E II | 1984 | 12999km |
   White" with a PACKED TURNOUT badge over a large car-art area, and below the art a row of
   three big stamp-style grade boxes: GRADE: 2 (red), INT: E (red), EXT: D (orange). Right
   panel: an info box for reserve / current bid / restoration etc., a large bid-amount field
   with up/down stepper arrows, and a big BID button.]

6. We need to think about balancing in the GLOBAL sense. It's kinda stupid that you can buy a
   car for 10k but brake pads cost twice that. We need a better economy balancing system that
   serves to balance the economy as a whole.

7. Let's maybe move the Complete Job function out of the car work screen and rather to the
   main job screen, so that you accept and complete jobs from the same place. And also, for
   each job, have a little better of a post-job screen: what was done, how much did it cost,
   what did you gain in rep and profit. Also what the repairs / parts installed cost you, and
   total profit.

8. In the auction screen you can remove this text: "(any bid resets the clock)".

9. Okay, let's talk economics of repair for auction vehicles. First screenshot is a freshly
   bought car, nothing done to it yet: 3,800 profit for a pure flip. Second screenshot is the
   result after a few of the cheapest repairs, simply going from poor to worn on a few cheap
   components, and replacing the brake pads and tyres. Now, after all that work, I'm making a
   LOSS of 41k.

   [Screenshot A - the lot as listed: Honda City E (AA), 1983, 116,226 km, red. Guide value
   Y7,735. Grade 2, Ext D, Int D. Restoration bill Y336,800. Reserve Y3,868, no bids, PACKED
   TURNOUT badge. Every group (engine, drivetrain, suspension, wheels, body, interior) shows
   Poor. Buy now Y10,000.]

   [Screenshot B - Finances panel, freshly bought at reserve: purchase Y3,868, repairs Y0,
   parts Y0, total spent Y3,868. Guide value Y7,735, restoration bill remaining Y336,800,
   projected profit +Y3,867. Sell ballpark value ~Y7,328.]

   [Screenshot C - Finances panel after the work described above: purchase Y3,868, repairs
   Y15,000, parts Y30,000, total spent Y48,868. Guide value Y7,735 (unchanged), restoration
   bill remaining Y291,800 (down exactly Y45,000), projected profit -Y41,133. Sell ballpark
   value ~Y7,430 (up only ~Y100 for Y45,000 of work).]

   Playtest aborted. This is STILL absolutely fucking broken. It should be VERY rare for the
   player NOT to make a profit by repairing the car and getting it to a better state. This is
   absolutely broken right now and needs to be the absolute primary focus. Why is it so
   unprofitable to repair cars and make them better? It's literally the whole point of the
   game, and right now the player gets punished for playing the game. This needs to be
   drastically fixed from the ground up. No more small patches. No more small adjustments.
   Gut the system and build a better one from the ground up. I need extremely deep analysis
   finding the exact issues and all of the systems that interact, and then a design for a
   better system. This is paramount and MUST be the primary focus.

10. The parts store needs work. You need to ALWAYS be able to see the cart; it should be
    visible from the main page where you have your main cards for each category. Change the
    "Suspension" category name to "Suspension and Brakes"; it's always hard to find the
    brakes. Need a better back button when in a hierarchy: there is already the path tree,
    but also add just a back button.
