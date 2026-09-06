/**
 * Integer vertical coordinates per building storey. The engine activation
 * changes this from one to two together with world height and save versions
 * (ADR 0008); consumers must distinguish storeys from coordinate increments.
 */
export const STOREY_LAYERS = 1;
