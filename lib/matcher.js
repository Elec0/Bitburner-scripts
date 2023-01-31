// @ts-check
/**
 * @fileoverview Functional-like matching functions.
 * Taken from this blog post: https://codeburst.io/alternative-to-javascripts-switch-statement-with-a-functional-twist-3f572787ba1c
 */
/**
 * 
 * @typedef DMatcher
 * @property {on} on
 * @property {otherwise} otherwise
 * 
 * @typedef DMatched
 * @property {onMatched} on
 * @property {otherwiseMatched} otherwise
 * 
 * 
 * @callback Matcher
 * @param {any} x
 * @returns {DMatcher}
 * 
 * @callback Matched
 * @param {any} x
 * @returns {DMatched}
 * 
 * @callback on
 * @param {(any) => boolean} pred
 * @param {() => any} fn
 * @returns {DMatcher | DMatched}
 *
 *
 * @callback otherwise
 * @param {(any) => any} fn
 * @returns {any}
 * 
 * @callback onMatched
 * @returns {DMatched}
 *
 * @callback otherwiseMatched
 * @returns {any}
 */

/** @type {Matched} */
const matched = x => ({
    // If the value has matched, no other 'on' case matters, and otherwise returns the value
    on: () => matched(x),
    otherwise: () => x
})

/** @type {Matcher} */
export const match = x => ({
    on: (pred, fn) => pred(x) ? matched(fn()) : match(x),

    otherwise: fn => fn(x)
});
match(1).on(z => z == true, () => 5);
