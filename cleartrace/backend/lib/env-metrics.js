/**
 * ClearTrace — Environmental (Water & Waste) metric definitions.
 * Only KPI definitions live here; actual values are stored in the database.
 */

const WATER_METRICS = {
  'Water': {
    gri: 'GRI 303',
    metrics: [
      { key: 'total_water_withdrawn',   label: 'Total water withdrawn',                      type: 'number',  unit: 'm³'     },
      { key: 'total_water_consumed',    label: 'Total water consumed',                        type: 'number',  unit: 'm³'     },
      { key: 'water_recycled_percent',  label: 'Water recycled or reused',                    type: 'percent', unit: '%'      },
      { key: 'water_discharge_m3',      label: 'Total water discharged',                      type: 'number',  unit: 'm³'     },
      { key: 'water_intensity',         label: 'Water intensity per £1m revenue',             type: 'number',  unit: 'm³/£1m' },
    ],
  },
};

const WASTE_METRICS = {
  'Waste': {
    gri: 'GRI 306',
    metrics: [
      { key: 'total_waste_generated',  label: 'Total waste generated',                        type: 'number',  unit: 'tonnes' },
      { key: 'waste_to_landfill',      label: 'Waste to landfill',                            type: 'number',  unit: 'tonnes' },
      { key: 'waste_recycled',         label: 'Waste recycled',                               type: 'number',  unit: 'tonnes' },
      { key: 'waste_recovered',        label: 'Waste recovered / energy recovery',            type: 'number',  unit: 'tonnes' },
      { key: 'hazardous_waste',        label: 'Hazardous waste generated',                    type: 'number',  unit: 'tonnes' },
      { key: 'waste_diversion_rate',   label: 'Waste diversion rate from landfill',           type: 'percent', unit: '%'      },
    ],
  },
};

module.exports = { WATER_METRICS, WASTE_METRICS };
