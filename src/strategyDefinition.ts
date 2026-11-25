import { Strategy, ConditionGroup, RangeCondition, ComparisonOperator, LogicalOperator } from "./strategyTypes";
import { ResearchPrediction } from "./researchLab";

/**
 * Strategy Definition Engine: Parses, validates, and evaluates trading strategy rules
 * against market research snapshots and probability predictions.
 */

export function getNestedValue(obj: any, pathStr: string): any {
  if (!obj) return undefined;
  const keys = pathStr.split(".");
  let current = obj;
  for (const key of keys) {
    if (current === null || current === undefined) return undefined;
    current = current[key];
  }
  return current;
}

export function evaluateRangeCondition(condition: RangeCondition, pred: ResearchPrediction): boolean {
  const val = getNestedValue(pred, condition.field);
  if (val === undefined || val === null) {
    return false; // Field missing means condition fails
  }

  const compVal = condition.value;
  const operator = condition.operator;

  // Handle numerical comparisons
  if (typeof val === "number" && typeof compVal === "number") {
    switch (operator) {
      case "LT": return val < compVal;
      case "LTE": return val <= compVal;
      case "GT": return val > compVal;
      case "GTE": return val >= compVal;
      case "EQ": return val === compVal;
      case "NEQ": return val !== compVal;
      case "BETWEEN": {
        const val2 = condition.value2 !== undefined ? condition.value2 : compVal;
        return val >= compVal && val <= val2;
      }
      default: return false;
    }
  }

  // Handle string comparisons
  if (typeof val === "string" && typeof compVal === "string") {
    switch (operator) {
      case "EQ": return val.toLowerCase() === compVal.toLowerCase();
      case "NEQ": return val.toLowerCase() !== compVal.toLowerCase();
      default: return false;
    }
  }

  return false;
}

export function evaluateConditionGroup(group: ConditionGroup, pred: ResearchPrediction): boolean {
  if (!group.conditions || group.conditions.length === 0) {
    return true; // Empty group defaults to true
  }

  const results = group.conditions.map((cond) => {
    if ("operator" in cond && "conditions" in cond) {
      return evaluateConditionGroup(cond, pred);
    } else {
      return evaluateRangeCondition(cond as RangeCondition, pred);
    }
  });

  switch (group.operator) {
    case "AND":
      return results.every((r) => r === true);
    case "OR":
      return results.some((r) => r === true);
    case "NOT":
      // A NOT group negates the logical evaluation of its internal elements (AND or OR inside)
      return !results.every((r) => r === true);
    default:
      return false;
  }
}

/**
 * Evaluates whether a prediction triggers a strategy.
 * Returns either LONG, SHORT, or FLAT.
 * Traditional strategies trigger a direction based on up vs down signals.
 * E.g., if conditions are met, go LONG if prediction up probability >= down, else SHORT.
 */
export function evaluateStrategySignal(strategy: Strategy, pred: ResearchPrediction): "LONG" | "SHORT" | "FLAT" {
  const isTriggered = evaluateConditionGroup(strategy.conditions, pred);
  if (!isTriggered) {
    return "FLAT";
  }

  // If triggered, use the direction of highest probability
  const upProb = pred.predictedProbs?.up || 0.5;
  const downProb = pred.predictedProbs?.down || 0.5;

  if (upProb > downProb) {
    return "LONG";
  } else if (downProb > upProb) {
    return "SHORT";
  }
  return "FLAT";
}
