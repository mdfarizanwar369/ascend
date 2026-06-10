"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COMPLIANCE_WEIGHTS = exports.LOCAL_FOODS = exports.PLANS = void 0;
exports.PLANS = {
    free: { label: "Free", priceRm: 0, audience: "Client" },
    premium: { label: "Premium", priceRm: 19, audience: "Client" },
    trainer_pro: { label: "Trainer Pro", priceRm: 99, audience: "Trainer" }
};
exports.LOCAL_FOODS = [
    "Nasi Lemak",
    "Chicken Rice",
    "Mee Goreng",
    "Roti Canai",
    "Satay",
    "Laksa",
    "Char Kway Teow",
    "Economy Rice",
    "Teh Tarik",
    "Briyani",
    "Thosai",
    "Wanton Mee"
];
exports.COMPLIANCE_WEIGHTS = {
    food: 35,
    weight: 25,
    water: 20,
    habits: 20
};
