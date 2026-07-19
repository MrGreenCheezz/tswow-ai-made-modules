# TSWoW AI-Made Modules

A collection of modules for TSWoW WotLK 3.3.5a. Russian and English text is
selected automatically according to the game client language.

## Installation

1. Copy the directories from `modules/` to `<tswow>/modules/`.
2. Enable `Client.Patches = ["all"]` in the target dataset.
3. Run `build all`.

The modules are installed together because they share generated contracts
and UI resources. See [`modules/PORTABILITY.md`](modules/PORTABILITY.md) for
details.

## Modules

| Module | Purpose and dependencies |
| --- | --- |
| `attributes` | Makes Strength increase health, Agility increase speed, and Intellect increase spell power and healing. Standalone. |
| `echoes` | Adds Echo cards and a collection of powerful boss-book auras. Uses `client-extensions` and integrates with base building and ability gems. |
| `base-building` | Adds persistent bases, construction, storage, production, workers, and woodcutting. Uses `echoes`, `craft-all`, `custom-stats`, `gem-abilities`, and `tswow-store`. |
| `craft-all` | Generates equipment recipes and the crafting-station recipe catalog used by `base-building`. |
| `custom-companions` | Adds combat companions, training, professions, base work, and expeditions. Uses `base-building`, `gem-abilities`, `retail-talents`, and `tswow-store`. |
| `custom-stats` | Adds persistent item affixes, life steal, thorns, mastery, and weapon procs. Uses `client-extensions`. |
| `gem-abilities` | Adds the HERO gem-based ability system, professions, and empowered enemies. Uses woodcutting from `base-building`; Echo integration is optional. |
| `retail-talents` | Adds five class-independent talent trees. Uses the `tswow-store` UI and generates talent IDs for companions. |
| `simple-button-addon` | A standalone sample talent window opened with `/simplebutton` or `/sbutton`. |
| `survival` | Adds hunger, thirst, cold, camps, and cooking. Uses shelters and campfires from `base-building`. |
| `tswow-store` | Adds a donation-points store with purchase auditing. The schema is created automatically; the server owner supplies products and balances. |

## Third-party module

`tswow-store` is not our module; it is publicly available and was reused in
this collection.
