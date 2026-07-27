// An emissions_entries row records something that happened, not something
// planned — the app has a separate targets/baseline mechanism
// (companies.reduction_target_pct/target_year, baseline_emissions) for
// forward-looking figures. period-locking (locked_periods) further implies
// periods are meant to be closed, historical reporting windows.
//
// Rejects any period strictly later than the current calendar month. The
// current month itself is allowed — mid-month logging, as data is
// collected, is the normal case, not something to block.
function isFuturePeriod(period) {
  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return period > currentPeriod;
}

module.exports = { isFuturePeriod };
