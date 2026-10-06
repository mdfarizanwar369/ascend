import { AI_DATA_CATEGORIES } from "@ascend/shared";

// Keep the same data disclosure and consent scope, without advertising a
// integration in unrelated editions. New Apple Health imports stay isolated
// from this AI consent scope and are never included in AI context in V1.
export const iosAiDataCategories = AI_DATA_CATEGORIES.map(category =>
  category.replace("activity imported from Health Connect", "activity imported from connected services")
);
