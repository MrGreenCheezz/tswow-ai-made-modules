import { RegisterBaseBuilding } from "./base";
import { RegisterBuildingGallery } from "./gallery";
import { RegisterBaseRaids } from "./raids";
import { RegisterBaseStorage, settleStationWorkerChange } from "./storage";
import { RegisterBaseWorkforce } from "./workforce";
import { RegisterResourceGenerators } from "./resource-generators";
import { RegisterBaseServices } from "./services";
import { InitializeBaseOrders } from "./orders";
import {
    CRAFT_STATION_CATALOG_VERSION, CRAFT_STATION_CATALOG_READY, CRAFT_STATION_RECIPES,
} from "../shared/generated/CraftStationRecipes";
import {
    ORDER_REWARD_GEM_CATALOG_VERSION, ORDER_REWARD_GEM_CATALOG_READY, ORDER_REWARD_GEMS,
} from "../shared/generated/AbilityGemRewards";

export function Main(events: TSEvents) {
    if (CRAFT_STATION_CATALOG_VERSION != 2
        || !CRAFT_STATION_CATALOG_READY || CRAFT_STATION_RECIPES.length == 0
        || ORDER_REWARD_GEM_CATALOG_VERSION != 1
        || !ORDER_REWARD_GEM_CATALOG_READY || ORDER_REWARD_GEMS.length == 0) {
        throw new Error(
            "base-building generated catalogs are missing or stale: run build data before build scripts no-inline",
        );
    }
    RegisterBaseBuilding(events);
    RegisterBuildingGallery(events);
    RegisterBaseRaids(events);
    RegisterBaseStorage(events);
    RegisterBaseWorkforce(events, settleStationWorkerChange);
    RegisterResourceGenerators(events);
    RegisterBaseServices(events);
    InitializeBaseOrders(events);
}
