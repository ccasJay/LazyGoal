var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// GitDiffInput-validator.cjs
var require_GitDiffInput_validator = __commonJS({
  "GitDiffInput-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        for (const key0 in data) {
          if (!(key0 === "repoPath" || key0 === "paths" || key0 === "staged" || key0 === "commit" || key0 === "baseCommit" || key0 === "maxLines" || key0 === "cursor")) {
            const err0 = { instancePath, schemaPath: "#/definitions/GitDiffInput/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err0];
            } else {
              vErrors.push(err0);
            }
            errors++;
          }
        }
        if (data.repoPath !== void 0) {
          if (typeof data.repoPath !== "string") {
            const err1 = { instancePath: instancePath + "/repoPath", schemaPath: "#/definitions/GitDiffInput/properties/repoPath/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
        }
        if (data.paths !== void 0) {
          let data1 = data.paths;
          if (Array.isArray(data1)) {
            const len0 = data1.length;
            for (let i0 = 0; i0 < len0; i0++) {
              if (typeof data1[i0] !== "string") {
                const err2 = { instancePath: instancePath + "/paths/" + i0, schemaPath: "#/definitions/GitDiffInput/properties/paths/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err2];
                } else {
                  vErrors.push(err2);
                }
                errors++;
              }
            }
          } else {
            const err3 = { instancePath: instancePath + "/paths", schemaPath: "#/definitions/GitDiffInput/properties/paths/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.staged !== void 0) {
          if (typeof data.staged !== "boolean") {
            const err4 = { instancePath: instancePath + "/staged", schemaPath: "#/definitions/GitDiffInput/properties/staged/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.commit !== void 0) {
          if (typeof data.commit !== "string") {
            const err5 = { instancePath: instancePath + "/commit", schemaPath: "#/definitions/GitDiffInput/properties/commit/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.baseCommit !== void 0) {
          if (typeof data.baseCommit !== "string") {
            const err6 = { instancePath: instancePath + "/baseCommit", schemaPath: "#/definitions/GitDiffInput/properties/baseCommit/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.maxLines !== void 0) {
          let data6 = data.maxLines;
          if (!(typeof data6 == "number" && (!(data6 % 1) && !isNaN(data6)) && isFinite(data6))) {
            const err7 = { instancePath: instancePath + "/maxLines", schemaPath: "#/definitions/GitDiffInput/properties/maxLines/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
          if (typeof data6 == "number" && isFinite(data6)) {
            if (data6 > 2e3 || isNaN(data6)) {
              const err8 = { instancePath: instancePath + "/maxLines", schemaPath: "#/definitions/GitDiffInput/properties/maxLines/maximum", keyword: "maximum", params: { comparison: "<=", limit: 2e3 }, message: "must be <= 2000" };
              if (vErrors === null) {
                vErrors = [err8];
              } else {
                vErrors.push(err8);
              }
              errors++;
            }
            if (data6 < 1 || isNaN(data6)) {
              const err9 = { instancePath: instancePath + "/maxLines", schemaPath: "#/definitions/GitDiffInput/properties/maxLines/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
          }
        }
        if (data.cursor !== void 0) {
          if (typeof data.cursor !== "string") {
            const err10 = { instancePath: instancePath + "/cursor", schemaPath: "#/definitions/GitDiffInput/properties/cursor/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
      } else {
        const err11 = { instancePath, schemaPath: "#/definitions/GitDiffInput/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
      validate10.errors = vErrors;
      return errors === 0;
    }
  }
});
export default require_GitDiffInput_validator();
