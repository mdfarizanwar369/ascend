import AppIntents

@available(iOS 16.0, *)
private func ascendAnswer(_ metric: String) async -> IntentDialog {
    IntentDialog(stringLiteral: await AscendSiriService.answer(metric))
}

@available(iOS 16.0, *)
private func ascendQuestion(_ question: String) async -> IntentDialog {
    IntentDialog(stringLiteral: await AscendSiriService.ask(question))
}

// A fixed vocabulary lets Siri include the question in a single App Shortcut
// phrase. Free-form String parameters cannot be interpolated into those phrases.
@available(iOS 16.0, *)
enum AscendTopic: String, AppEnum {
    case caloriesLeft = "How many calories do I have left?"
    case caloriesEaten = "How many calories have I eaten today?"
    case calorieGoal = "What is my calorie target?"
    case waterDrank = "How much water did I drink today?"
    case waterLeft = "How much water do I have left today?"
    case waterGoal = "What is my water goal?"
    case waterLoggedAny = "Have I logged any water today?"
    case proteinEaten = "How much protein have I eaten today?"
    case proteinLeft = "How much protein do I have left?"
    case proteinGoal = "What is my protein target?"
    case carbsEaten = "How many carbs have I eaten today?"
    case carbsLeft = "How many carbs do I have left?"
    case carbGoal = "What is my carb target?"
    case fatEaten = "How much fat have I eaten today?"
    case fatLeft = "How much fat do I have left?"
    case fatGoal = "What is my fat target?"
    case macros = "How are my macros today?"
    case mealCount = "How many meals have I logged today?"
    case foodLogged = "Have I logged any food today?"
    case latestMeal = "What is my latest meal?"
    case mealsToday = "What have I eaten today?"
    case workoutToday = "What is my workout today?"
    case workoutExercises = "Which exercises are in my workout?"
    case workoutCompleted = "Did I complete my workout today?"
    case workoutLogged = "Have I logged a workout today?"
    case workoutCaloriesBurned = "How many calories did I burn in workouts today?"
    case workoutsThisWeek = "How many workouts this week?"
    case workoutsToday = "How many workouts have I done today?"
    case latestWeight = "What is my latest weight?"
    case weightGoal = "What is my target weight?"
    case weightChange = "How much has my weight changed?"
    case fitnessGoal = "What is my fitness goal?"
    case sleep = "How did I sleep today?"
    case steps = "How many steps today?"
    case activeCalories = "How many active calories did I burn today?"
    case membership = "What is my Ascend membership?"
    case dailySummary = "How am I doing today?"

    static var typeDisplayRepresentation: TypeDisplayRepresentation { "Ascend information" }
    static var caseDisplayRepresentations: [Self: DisplayRepresentation] { [
        .caloriesLeft: DisplayRepresentation(title: "how many calories do I have left", synonyms: ["how many calories can I eat now", "how much can I eat today"]),
        .caloriesEaten: DisplayRepresentation(title: "how many calories have I eaten today", synonyms: ["how many calories have I logged today"]),
        .calorieGoal: DisplayRepresentation(title: "what is my calorie target", synonyms: ["what is my calorie budget today"]),
        .waterDrank: DisplayRepresentation(title: "how much water have I had today", synonyms: ["how much water did I drink today", "how much water have I logged today"]),
        .waterLeft: DisplayRepresentation(title: "how much more water do I need today", synonyms: ["how much water do I have left today", "how much water should I still drink today"]),
        .waterGoal: DisplayRepresentation(title: "what is my water goal", synonyms: ["what is my daily water target"]),
        .waterLoggedAny: DisplayRepresentation(title: "have I logged any water today", synonyms: ["did I drink any water today"]),
        .proteinEaten: DisplayRepresentation(title: "how much protein have I eaten today", synonyms: ["how much protein have I logged today"]),
        .proteinLeft: DisplayRepresentation(title: "how much protein do I have left", synonyms: ["how much more protein do I need today"]),
        .proteinGoal: DisplayRepresentation(title: "what is my protein target", synonyms: ["what is my protein goal"]),
        .carbsEaten: DisplayRepresentation(title: "how many carbs have I eaten today", synonyms: ["how many carbs have I logged"]),
        .carbsLeft: DisplayRepresentation(title: "how many carbs do I have left", synonyms: ["how many more carbs can I eat"]),
        .carbGoal: DisplayRepresentation(title: "what is my carb target", synonyms: ["what is my carb goal"]),
        .fatEaten: DisplayRepresentation(title: "how much fat have I eaten today", synonyms: ["how much fat have I logged"]),
        .fatLeft: DisplayRepresentation(title: "how much fat do I have left", synonyms: ["how much more fat can I eat"]),
        .fatGoal: DisplayRepresentation(title: "what is my fat target", synonyms: ["what is my fat goal"]),
        .macros: DisplayRepresentation(title: "how are my macros today", synonyms: ["what are my macros so far"]),
        .mealCount: DisplayRepresentation(title: "how many meals have I logged today", synonyms: ["how many times have I eaten today"]),
        .foodLogged: DisplayRepresentation(title: "have I logged any food today", synonyms: ["did I log any food today", "have I eaten anything today"]),
        .latestMeal: DisplayRepresentation(title: "what was my latest meal", synonyms: ["what did I eat last"]),
        .mealsToday: DisplayRepresentation(title: "what have I eaten today", synonyms: ["what food have I logged today"]),
        .workoutToday: DisplayRepresentation(title: "what is my workout today", synonyms: ["what workout did Zoe make for me"]),
        .workoutExercises: DisplayRepresentation(title: "what exercises are in my workout", synonyms: ["what moves are in my workout today"]),
        .workoutCompleted: DisplayRepresentation(title: "did I finish my Zoe workout today", synonyms: ["did I complete my workout today"]),
        .workoutLogged: DisplayRepresentation(title: "have I logged a workout today", synonyms: ["did I log any workout today", "have I worked out today"]),
        .workoutCaloriesBurned: DisplayRepresentation(title: "how many calories did I burn in workouts today", synonyms: ["how many workout calories have I logged today"]),
        .workoutsThisWeek: DisplayRepresentation(title: "how many workouts have I logged this week", synonyms: ["how many workouts in the last seven days"]),
        .workoutsToday: DisplayRepresentation(title: "how many workouts have I done today", synonyms: ["how many workouts did I log today"]),
        .latestWeight: DisplayRepresentation(title: "what is my latest weight", synonyms: ["how much do I weigh"]),
        .weightGoal: DisplayRepresentation(title: "what is my target weight", synonyms: ["what is my weight goal"]),
        .weightChange: DisplayRepresentation(title: "how much has my weight changed", synonyms: ["how much weight have I lost"]),
        .fitnessGoal: DisplayRepresentation(title: "what is my fitness goal", synonyms: ["what am I working towards"]),
        .sleep: DisplayRepresentation(title: "how did I sleep today", synonyms: ["what was my sleep check in"]),
        .steps: DisplayRepresentation(title: "how many steps have I taken today", synonyms: ["what is my step count today"]),
        .activeCalories: DisplayRepresentation(title: "how many active calories did I burn today", synonyms: ["how much energy did I burn today"]),
        .membership: DisplayRepresentation(title: "what is my Ascend membership", synonyms: ["what plan am I on"]),
        .dailySummary: DisplayRepresentation(title: "how am I doing today", synonyms: ["give me my daily summary"])
    ] }
}

@available(iOS 16.0, *)
struct AscendTopicIntent: AppIntent {
    static var title: LocalizedStringResource = "Check Ascend information"
    static var description = IntentDescription("Ask directly about an Ascend number or record.")
    static var authenticationPolicy: IntentAuthenticationPolicy = .requiresLocalDeviceAuthentication

    @Parameter(title: "Information") var topic: AscendTopic

    static var parameterSummary: some ParameterSummary {
        Summary("Check \(\.$topic) in Ascend")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        .result(dialog: await ascendQuestion(topic.rawValue))
    }
}

@available(iOS 16.0, *)
struct AscendAskIntent: AppIntent {
    static var title: LocalizedStringResource = "Ask Ascend"
    static var description = IntentDescription("Ask about your Ascend food, water, workouts, progress, or account.")
    static var authenticationPolicy: IntentAuthenticationPolicy = .requiresLocalDeviceAuthentication

    @Parameter(title: "Question", requestValueDialog: .init(stringLiteral: "What would you like to ask Ascend?"))
    var question: String

    static var parameterSummary: some ParameterSummary {
        Summary("Ask Ascend \(\.$question)")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        .result(dialog: await ascendQuestion(question))
    }
}

@available(iOS 16.0, *)
struct AscendCaloriesLeftIntent: AppIntent {
    static var title: LocalizedStringResource = "Calories left in Ascend"
    static var description = IntentDescription("Check how many calories remain in today's Ascend guide.")
    static var authenticationPolicy: IntentAuthenticationPolicy = .requiresLocalDeviceAuthentication
    func perform() async throws -> some IntentResult & ProvidesDialog {
        .result(dialog: await ascendAnswer("calories_remaining"))
    }
}

@available(iOS 16.0, *)
struct AscendCaloriesLoggedIntent: AppIntent {
    static var title: LocalizedStringResource = "Calories logged in Ascend"
    static var description = IntentDescription("Check calories logged in Ascend today.")
    static var authenticationPolicy: IntentAuthenticationPolicy = .requiresLocalDeviceAuthentication
    func perform() async throws -> some IntentResult & ProvidesDialog {
        .result(dialog: await ascendAnswer("calories_consumed"))
    }
}

@available(iOS 16.0, *)
struct AscendWaterIntent: AppIntent {
    static var title: LocalizedStringResource = "Water in Ascend"
    static var description = IntentDescription("Check water logged and remaining today.")
    static var authenticationPolicy: IntentAuthenticationPolicy = .requiresLocalDeviceAuthentication
    func perform() async throws -> some IntentResult & ProvidesDialog {
        .result(dialog: await ascendAnswer("water_status"))
    }
}

@available(iOS 16.0, *)
struct AscendFoodLoggedIntent: AppIntent {
    static var title: LocalizedStringResource = "Food logged in Ascend"
    static var description = IntentDescription("Check whether you logged any food today.")
    static var authenticationPolicy: IntentAuthenticationPolicy = .requiresLocalDeviceAuthentication

    func perform() async throws -> some IntentResult & ProvidesDialog {
        .result(dialog: await ascendQuestion("Have I logged any food today?"))
    }
}

@available(iOS 16.0, *)
struct AscendWorkoutLoggedIntent: AppIntent {
    static var title: LocalizedStringResource = "Workout logged in Ascend"
    static var description = IntentDescription("Check whether you logged a workout today.")
    static var authenticationPolicy: IntentAuthenticationPolicy = .requiresLocalDeviceAuthentication

    func perform() async throws -> some IntentResult & ProvidesDialog {
        .result(dialog: await ascendQuestion("Have I logged a workout today?"))
    }
}

@available(iOS 16.0, *)
struct AscendProteinIntent: AppIntent {
    static var title: LocalizedStringResource = "Protein in Ascend"
    static var description = IntentDescription("Check protein logged and remaining today.")
    static var authenticationPolicy: IntentAuthenticationPolicy = .requiresLocalDeviceAuthentication
    func perform() async throws -> some IntentResult & ProvidesDialog {
        .result(dialog: await ascendAnswer("protein_status"))
    }
}

@available(iOS 16.0, *)
struct AscendTodaySummaryIntent: AppIntent {
    static var title: LocalizedStringResource = "Ascend daily summary"
    static var description = IntentDescription("Hear today's calories, protein, water, and calorie balance.")
    static var authenticationPolicy: IntentAuthenticationPolicy = .requiresLocalDeviceAuthentication
    func perform() async throws -> some IntentResult & ProvidesDialog {
        .result(dialog: await ascendAnswer("today_summary"))
    }
}

@available(iOS 16.0, *)
struct AscendWorkoutIntent: AppIntent {
    static var title: LocalizedStringResource = "Workout in Ascend"
    static var description = IntentDescription("Hear your Zoe workout for today.")
    static var authenticationPolicy: IntentAuthenticationPolicy = .requiresLocalDeviceAuthentication
    func perform() async throws -> some IntentResult & ProvidesDialog {
        .result(dialog: await ascendQuestion("What is my workout today?"))
    }
}

@available(iOS 16.0, *)
struct AscendWeightIntent: AppIntent {
    static var title: LocalizedStringResource = "Weight in Ascend"
    static var description = IntentDescription("Hear your latest logged weight.")
    static var authenticationPolicy: IntentAuthenticationPolicy = .requiresLocalDeviceAuthentication
    func perform() async throws -> some IntentResult & ProvidesDialog {
        .result(dialog: await ascendQuestion("What is my latest weight?"))
    }
}

@available(iOS 16.0, *)
struct AscendStepsIntent: AppIntent {
    static var title: LocalizedStringResource = "Steps in Ascend"
    static var description = IntentDescription("Check steps synced with Ascend.")
    static var authenticationPolicy: IntentAuthenticationPolicy = .requiresLocalDeviceAuthentication
    func perform() async throws -> some IntentResult & ProvidesDialog {
        .result(dialog: await ascendQuestion("How many steps today?"))
    }
}

@available(iOS 16.0, *)
struct AscendSleepIntent: AppIntent {
    static var title: LocalizedStringResource = "Sleep in Ascend"
    static var description = IntentDescription("Check your sleep quality check-in.")
    static var authenticationPolicy: IntentAuthenticationPolicy = .requiresLocalDeviceAuthentication
    func perform() async throws -> some IntentResult & ProvidesDialog {
        .result(dialog: await ascendQuestion("How did I sleep today?"))
    }
}

@available(iOS 16.0, *)
struct AscendSiriShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: AscendTopicIntent(), phrases: [
            "Ask \(.applicationName) \(\.$topic)",
            "Check \(\.$topic) in \(.applicationName)",
            "Ask \(.applicationName) about \(\.$topic)"
        ], shortTitle: "Check Ascend", systemImageName: "questionmark.bubble")
        AppShortcut(intent: AscendCaloriesLeftIntent(), phrases: [
            "Ask \(.applicationName) how many calories I can eat now",
            "Ask \(.applicationName) how many calories I have left",
            "How many calories are left in \(.applicationName)"
        ], shortTitle: "Calories left", systemImageName: "flame")
        AppShortcut(intent: AscendCaloriesLoggedIntent(), phrases: [
            "Ask \(.applicationName) how many calories I have eaten",
            "How many calories have I logged in \(.applicationName)"
        ], shortTitle: "Calories logged", systemImageName: "fork.knife")
        AppShortcut(intent: AscendWaterIntent(), phrases: [
            "Ask \(.applicationName) how much water I have drunk",
            "Ask \(.applicationName) how much water I drank",
            "Check how much water I drank in \(.applicationName)",
            "How much water have I logged in \(.applicationName)",
            "Ask \(.applicationName) how much water I have left",
            "Ask \(.applicationName) how much more water do I need today",
            "Ask \(.applicationName) how much water I still need today"
        ], shortTitle: "Water today", systemImageName: "drop")
        AppShortcut(intent: AscendProteinIntent(), phrases: [
            "Ask \(.applicationName) how much protein I have had",
            "How much protein do I have left in \(.applicationName)"
        ], shortTitle: "Protein today", systemImageName: "bolt")
        AppShortcut(intent: AscendFoodLoggedIntent(), phrases: [
            "Ask \(.applicationName) have I logged any food today",
            "Ask \(.applicationName) did I log any food today",
            "Ask \(.applicationName) have I eaten anything today"
        ], shortTitle: "Food logged", systemImageName: "fork.knife.circle")
        AppShortcut(intent: AscendWorkoutIntent(), phrases: [
            "Ask \(.applicationName) what my workout is today",
            "What's my workout in \(.applicationName)"
        ], shortTitle: "Today's workout", systemImageName: "figure.strengthtraining.traditional")
        AppShortcut(intent: AscendWorkoutLoggedIntent(), phrases: [
            "Ask \(.applicationName) have I logged any workout today",
            "Ask \(.applicationName) did I log a workout today",
            "Ask \(.applicationName) have I worked out today"
        ], shortTitle: "Workout logged", systemImageName: "checkmark.circle")
        AppShortcut(intent: AscendWeightIntent(), phrases: [
            "Ask \(.applicationName) what my weight is",
            "What's my latest weight in \(.applicationName)"
        ], shortTitle: "Latest weight", systemImageName: "scalemass")
        AppShortcut(intent: AscendStepsIntent(), phrases: [
            "Ask \(.applicationName) how many steps I have today",
            "How many steps in \(.applicationName)"
        ], shortTitle: "Steps today", systemImageName: "figure.walk")
    }
}
