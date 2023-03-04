/**
 * @param {number} time 
 * @returns {string} - time in hhmmss format
 */
export function formatTime(time) {
    let ms = time;

    let hour = Math.trunc(ms / (3600 * 1000));
    ms = ms % (3600 * 1000); // seconds remaining after extracting hours
    let min = Math.trunc(ms / (60 * 1000));
    ms = ms % (60 * 1000); // seconds remaining after extracting minutes
    let sec = Math.trunc(ms / 1000);
    ms = Math.round(ms % 1000); // ms remaining after extracting seconds
    return (hour != 0 ? `${hour}h` : "")
        + (min != 0 ? `${min}m` : "")
        + (sec != 0 ? `${sec}s ` : "")
        + (`${ms}ms`);
}