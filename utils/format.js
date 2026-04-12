'use strict';

/**
 * Formats a number as a price.
 * @param {number} amount - The amount to format.
 * @param {string} currency - The currency symbol, default is '$'.
 * @returns {string} - The formatted price.
 */
function formatPrice(amount, currency = '$') {
    return `${currency}${amount.toFixed(2)}`;
}

/**
 * Formats a number to a specified decimal place.
 * @param {number} value - The number to format.
 * @param {number} decimals - The number of decimal places.
 * @returns {string} - The formatted number.
 */
function formatNumber(value, decimals = 2) {
    return value.toFixed(decimals);
}

/**
 * Formats a quantity, ensuring it's displayed as an integer.
 * @param {number} qty - The quantity to format.
 * @returns {string} - The formatted quantity.
 */
function formatQuantity(qty) {
    return Math.round(qty).toString();
}

// Exporting the functions for use in other modules
module.exports = {
    formatPrice,
    formatNumber,
    formatQuantity
};
