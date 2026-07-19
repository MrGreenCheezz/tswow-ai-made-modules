# TSWoW-Store

## Overview
This store system allows players to purchase items using donation points. The system consists of database tables for items and audit tracking and custom packets to glue this all together.

## Database Tables

### `store_items` Table
Main table containing all store items and their properties.

### `donation_points` Column
Added to the `account` table in the auth database to track player currency.

### `store_audit` Table
Tracks all store purchases for auditing and history purposes.

## Store Item Structure

| Property | Type | Description |
|----------|------|-------------|
| `ID` | number | Unique identifier for the store item |
| `Name` | string | Display name of the item |
| `Description` | string | Item description shown to players |
| `NameEn` | string | Optional English display name (`name_en`); falls back to `name` |
| `DescriptionEn` | string | Optional English description (`description_en`); falls back to `description` |
| `Cost` | number | Price in donation points |
| `Category` | number | Category ID for organizing items |
| `Flags` | number | Bitwise flags defining item behavior |
| `PurchaseID` | number | Item ID to give to the player |
| `ExtraID` | number | Additional ID (creature ID for pets/mounts) |

### Store Item Flags

Flags use bitwise operations to combine multiple properties:

| Flag | Value | Description |
|------|-------|-------------|
| `iSCreature` | 1 | Item is a creature (pet/mount) |
| `isEquipment` | 2 | Item is equipment/gear |
| `isSale10` | 4 | Item has 10% discount |
| `isSale20` | 8 | Item has 20% discount |
| `isSale50` | 16 | Item has 50% discount |

### Adding Store Items
This is all handled in the database.

```sql
INSERT INTO `store_items` (`id`, `flags`, `cost`, `name`, `description`, `name_en`, `description_en`, `category`, `purchase_id`, `extra_id`)
VALUES (1, 1, 1, 'Стремительный призрачный тигр', 'Величественный призрачный тигр.', 'Swift Spectral Tiger', 'A majestic spectral tiger mount.', 3, 33225, 24004);
```

## Commands

### Reload Store Items
```
.reload store_items
```
Reloads all store items from the database without requiring a server restart. If you are adding a creature you will have to relog as `SendCreatureQueryPacket` are sent only OnLogin.

## Categories 
This is all changeable under the `Categories.ts` file under the `Components` folder. 

| ID | Name | Description |
|----|------|-------------|
| 0 | On Sale | Discounted items |
| 1 | Convenience | Utility items |
| 2 | Cosmetics | Appearance items |
| 3 | Mounts | Riding mounts |
| 4 | Bundles | Item packages |
| 5 | Druid Forms | Druid transformations |
| 6 | Warlock Forms | Warlock transformations |

This is what you have available by default.

## Credits

- Trapper, Kebful & Hater from Duskhaven
- Foereaper's Eluna-AIO-StoreSystem. Lots of code review from there to port this over.
- Tester - Who helped make this AddOn what it is now. Without his feedback this thing would be in the dumpster lol. Thanks rubber ducky.
