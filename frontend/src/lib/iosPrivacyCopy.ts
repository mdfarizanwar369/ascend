import { AI_DATA_CATEGORIES } from "@ascend/shared";

// Keep the same data disclosure and consent scope, without advertising a
// device integration that cannot be connected in the iPhone/iPad app.
export const iosAiDataCategories = AI_DATA_CATEGORIES.map(category =>
  category.replace("activity imported from Health Connect", "activity imported from connected services")
);
