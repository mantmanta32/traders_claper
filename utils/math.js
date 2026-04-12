// Common Math and Statistical Helpers

/**
 * Calculate the mean of an array of numbers.
 * @param {number[]} arr - The array of numbers.
 * @returns {number} The mean value.
 */
function mean(arr) {
    const sum = arr.reduce((accumulator, current) => accumulator + current, 0);
    return sum / arr.length;
}

/**
 * Calculate the median of an array of numbers.
 * @param {number[]} arr - The array of numbers.
 * @returns {number} The median value.
 */
function median(arr) {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Calculate the mode of an array of numbers.
 * @param {number[]} arr - The array of numbers.
 * @returns {number[]} The mode value(s).
 */
function mode(arr) {
    const frequency = {};
    arr.forEach((num) => {
        frequency[num] = (frequency[num] || 0) + 1;
    });
    const maxFreq = Math.max(...Object.values(frequency));
    return Object.keys(frequency).filter(num => frequency[num] === maxFreq).map(Number);
}

/**
 * Calculate the standard deviation of an array of numbers.
 * @param {number[]} arr - The array of numbers.
 * @returns {number} The standard deviation.
 */
function standardDeviation(arr) {
    const avg = mean(arr);
    const squaredDiffs = arr.map(num => Math.pow(num - avg, 2));
    return Math.sqrt(mean(squaredDiffs));
}

module.exports = { mean, median, mode, standardDeviation };