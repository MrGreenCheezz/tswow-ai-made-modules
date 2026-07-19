/**
 * Show a mana bar for classes that natively had no mana.
 *
 * The client draws the primary resource bar from ChrClasses.DisplayPower — the
 * server-side SetPowerType alone won't switch a warrior/rogue/DK bar. Setting
 * DisplayPower to Mana (0) makes these classes mana users on both client and
 * server, matching the unified-resource design.
 *
 * Hunter and Druid are already mana-based in 3.3.5, so they're left alone.
 *
 * Death Knight is intentionally EXCLUDED: the 3.3.5 client hardcodes its
 * rune/runic-power bar and won't render mana. DK keeps its native runic-power
 * bar and pays for gem abilities from a hidden mana pool (see livescripts/
 * resource.ts).
 */

import { std } from "wow/wotlk";

const MANA = 0; // Powers.MANA

std.Classes.load("WARRIOR").DisplayPower.set(MANA);
std.Classes.load("ROGUE").DisplayPower.set(MANA);

// Death Knight: give it a REAL mana pool (base mana per level) so both client
// and server agree it has mana. Without this DK max mana is 0, the server keeps
// resetting any runtime SetMaxPower back to 0, and the client blocks casts with
// "not enough mana". DK still displays its native runic-power bar (above); this
// mana is the hidden resource that actually pays for gem abilities.
std.Classes.load("DEATH_KNIGHT").Stats.BaseMana.set((old, level) => 500 + level * 200);
