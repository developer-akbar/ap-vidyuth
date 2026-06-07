/**
 * billing.js
 * 
 * Logic to estimate future APSPDCL bills based on unit consumption.
 */

/**
 * Official APSPDCL Domestic (LT-I) rates as of May 2026.
 */
export const DEFAULT_DOMESTIC_CONFIG = {
  id: 'domestic',
  label: 'Domestic',
  fixedChargesPerKW: 10,
  electricityDutyPct: 6,
  facPerUnit: 0, 
  slabs: [
    { min: 0,   max: 30,     rate: 1.9 },
    { min: 31,  max: 75,     rate: 3.00 },
    { min: 76,  max: 125,    rate: 4.50 },
    { min: 126, max: 225,    rate: 6.00 },
    { min: 226, max: 400,    rate: 8.75 },
    { min: 401, max: 999999, rate: 9.75 },
  ]
};

/**
 * Official APSPDCL Commercial (LT-II) rates as of May 2026.
 */
export const DEFAULT_COMMERCIAL_CONFIG = {
  id: 'commercial',
  label: 'Commercial',
  fixedChargesPerKW: 75, 
  electricityDutyPct: 6,
  facPerUnit: 0, 
  slabs: [
    { min: 0,   max: 50,     rate: 5.40 },
    { min: 51,  max: 100,    rate: 7.65 },
    { min: 101, max: 300,    rate: 9.05 },
    { min: 301, max: 500,    rate: 9.60 },
    { min: 501, max: 999999, rate: 9.95 },
  ]
};

/**
 * Calculates Energy Charges (EC) based on telescoping slabs.
 * 
 * Telescoping logic: units are distributed across slabs sequentially.
 * e.g. 150 units: 30 in slab1, 45 in slab2, 50 in slab3, 25 in slab4.
 */
function calculateEC(units, slabs) {
  if (units <= 0 || !slabs || slabs.length === 0) return 0;
  
  let totalEC = 0;
  let remainingUnits = units;

  // Ensure slabs are sorted by min consumption
  const sortedSlabs = [...slabs].sort((a, b) => a.min - b.min);

  let previousMax = 0;
  for (const slab of sortedSlabs) {
    // APSPDCL uses telescoping slabs (0-30, 31-75, etc.)
    // width = currentMax - previousMax
    const slabWidth = slab.max - previousMax;
    const unitsInSlab = Math.min(remainingUnits, slabWidth);
    
    totalEC += unitsInSlab * slab.rate;
    remainingUnits -= unitsInSlab;
    previousMax = slab.max;

    if (remainingUnits <= 0) break;
  }

  return totalEC;
}

/**
 * Estimates Customer Charges (CC) based on consumption units and type.
 * Specific tiered tables for Domestic (LT1) and Commercial (LT2) as per APSPDCL.
 */
function estimateCC(units, type = 'domestic') {
  if (type === 'commercial') {
    // LT2 Commercial CC table
    if (units <= 50) return 30;
    if (units <= 100) return 30;
    if (units <= 300) return 40;
    return 45;
  } else {
    // LT1 Domestic CC table
    if (units <= 50) return 25;
    if (units <= 75) return 30;
    if (units <= 125) return 45;
    if (units <= 225) return 50;
    return 55;
  }
}

/**
 * Main bill calculation entry point.
 * 
 * @param {number} units Total units consumed
 * @param {number} load Connected load in kW
 * @param {object} config Configuration (Slabs, charges, etc.)
 * @returns {object} Breakup of the estimated bill
 */
export function calculateEstimatedBill(units, load = 0, config = DEFAULT_DOMESTIC_CONFIG) {
  // 1. Energy Charges (Telescoping)
  const ec = calculateEC(units, config.slabs);
  
  // 2. Fixed Charges (based on Load)
  const fc = Math.max(0, load) * (config.fixedChargesPerKW || 0);
  
  // 3. Electricity Duty (Fixed percentage of units)
  const ed = units * ((config.electricityDutyPct || 0) / 100);
  
  // 4. Customer Charges (Tiered)
  const cc = estimateCC(units, config.id);
  
  // 5. Fuel Adjustment Charges (FAC)
  const fac = units * (config.facPerUnit || 0);
  
  const grossTotal = ec + fc + ed + cc + fac;
  
  return {
    units,
    ec: Math.round(ec * 100) / 100,
    fc: Math.round(fc * 100) / 100,
    ed: Math.round(ed * 100) / 100,
    cc: Math.round(cc * 100) / 100,
    fac: Math.round(fac * 100) / 100,
    total: Math.round(grossTotal),
  };
}
