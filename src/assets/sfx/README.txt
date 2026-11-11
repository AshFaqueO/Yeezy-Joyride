Custom sound effects
====================

Any audio file in this folder (.wav, .mp3 or .ogg) whose name matches a slot
below replaces the synthesized version of that sound. Restart `npm run dev`
or rebuild after adding files. Delete a file to get the synthesized sound back.

Loop
  thruster   jetpack burn, loops while thrust is held (currently jetpack_firelp.wav)

One-shots (played with a small random pitch change each time)
  record     picking up a Golden Record
  beep       drone lock-on warning tick
  launch     drone launches
  zap        hit by an electric zapper
  shutter    paparazzi camera flash
  explode    drone destroyed / drone hit
  hit        wipe-out
  land       landing on the roof
  ignite     jetpack ignition
  crate      supply crate collected
  fanfare    vehicle transformation
  smash      obstacle destroyed
  break      vehicle destroyed
  jump       vehicle jump
  charge     bear mech jump charging
  ring       Auto-Tune pack shot
  sneaker    Hype-Boost pack shot
  levelup    new city reached
  select     menu focus moved
  confirm    menu choice
  deny       menu refusal
  buy        (unused now that everything is free)

Example: copy a coin sound here as  record.wav

Only use sounds you have the rights to distribute: everything in this folder
is bundled into dist/ and published with the game.
