/**
 * pngRenderer — pure converter: SVG string → PNG buffer.
 * No file I/O, no HTTP concerns.
 * @module pngRenderer
 */

var { Resvg } = require("@resvg/resvg-js");

/**
 * Inject a white background rectangle right after the opening <svg> tag
 * so the rasterized PNG has a solid background instead of transparency.
 * @param {string} svgString
 * @returns {string}
 */
function addWhiteBackground(svgString) {
  // Insert after the first ">" that closes the <svg ...> tag.
  // Use style= to override the "rect {fill:none}" rule in the SVG's <defs>.
  var insertPos = svgString.indexOf(">") + 1;
  return (
    svgString.slice(0, insertPos) +
    '<rect width="100%" height="100%" style="fill:white"/>' +
    svgString.slice(insertPos)
  );
}

/**
 * Convert an SVG string to a PNG buffer.
 * @param {string} svgString — complete SVG markup
 * @param {object} [opts]
 * @param {number} [opts.width]  — target width in px (scales proportionally)
 * @returns {Buffer} PNG image data
 */
function svgToPng(svgString, opts) {
  var withBg = addWhiteBackground(svgString);
  var resvgOpts = {
    fitTo:
      opts && opts.width
        ? { mode: "width", value: opts.width }
        : { mode: "original" },
  };
  var resvg = new Resvg(withBg, resvgOpts);
  var pngData = resvg.render();
  return pngData.asPng();
}

module.exports = { svgToPng: svgToPng };
