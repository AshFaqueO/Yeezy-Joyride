Soundtracks
===========

Audio files here (.mp3, .ogg, .m4a or .wav) are looped as background music.
The file name picks when it plays:

    theme.*   default track (Kanye and the pixel-art eras)
    slim.*    plays while Slim Shady is the equipped character

Which track a character uses is the `music` field in src/config/eras.ts, so a
new character can point at any file name you add here. A character whose file
is missing falls back to theme, and with no theme file the game plays its
built-in synthesized chip-hop loop.

Restart `npm run dev` (or rebuild) after adding or removing files. Music goes
through the Music bus, so volume, pause dimming, ducking and the M mute key
all still apply. Overall music loudness is TRACK_TRIM_DB in
src/audio/ChipHopAudioEngine.ts.

Only use music you have the rights to distribute: these files are bundled into
dist/ and published with the game.
