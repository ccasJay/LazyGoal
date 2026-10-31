var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// ReadFileInput-validator.cjs
var require_ReadFileInput_validator = __commonJS({
  "ReadFileInput-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.path === void 0) {
          const err0 = { instancePath, schemaPath: "#/definitions/ReadFileInput/required", keyword: "required", params: { missingProperty: "path" }, message: "must have required property 'path'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "path" || key0 === "startLine" || key0 === "endLine" || key0 === "maxChars" || key0 === "cursor")) {
            const err1 = { instancePath, schemaPath: "#/definitions/ReadFileInput/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
        }
        if (data.path !== void 0) {
          if (typeof data.path !== "string") {
            const err2 = { instancePath: instancePath + "/path", schemaPath: "#/definitions/ReadFileInput/properties/path/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.startLine !== void 0) {
          let data1 = data.startLine;
          if (!(typeof data1 == "number" && (!(data1 % 1) && !isNaN(data1)) && isFinite(data1))) {
            const err3 = { instancePath: instancePath + "/startLine", schemaPath: "#/definitions/ReadFileInput/properties/startLine/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
          if (typeof data1 == "number" && isFinite(data1)) {
            if (data1 > 9007199254740991 || isNaN(data1)) {
              const err4 = { instancePath: instancePath + "/startLine", schemaPath: "#/definitions/ReadFileInput/properties/startLine/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err4];
              } else {
                vErrors.push(err4);
              }
              errors++;
            }
            if (data1 < 1 || isNaN(data1)) {
              const err5 = { instancePath: instancePath + "/startLine", schemaPath: "#/definitions/ReadFileInput/properties/startLine/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
              if (vErrors === null) {
                vErrors = [err5];
              } else {
                vErrors.push(err5);
              }
              errors++;
            }
          }
        }
        if (data.endLine !== void 0) {
          let data2 = data.endLine;
          if (!(typeof data2 == "number" && (!(data2 % 1) && !isNaN(data2)) && isFinite(data2))) {
            const err6 = { instancePath: instancePath + "/endLine", schemaPath: "#/definitions/ReadFileInput/properties/endLine/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
          if (typeof data2 == "number" && isFinite(data2)) {
            if (data2 > 9007199254740991 || isNaN(data2)) {
              const err7 = { instancePath: instancePath + "/endLine", schemaPath: "#/definitions/ReadFileInput/properties/endLine/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
            if (data2 < 1 || isNaN(data2)) {
              const err8 = { instancePath: instancePath + "/endLine", schemaPath: "#/definitions/ReadFileInput/properties/endLine/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
              if (vErrors === null) {
                vErrors = [err8];
              } else {
                vErrors.push(err8);
              }
              errors++;
            }
          }
        }
        if (data.maxChars !== void 0) {
          let data3 = data.maxChars;
          if (!(typeof data3 == "number" && (!(data3 % 1) && !isNaN(data3)) && isFinite(data3))) {
            const err9 = { instancePath: instancePath + "/maxChars", schemaPath: "#/definitions/ReadFileInput/properties/maxChars/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
          if (typeof data3 == "number" && isFinite(data3)) {
            if (data3 > 5e4 || isNaN(data3)) {
              const err10 = { instancePath: instancePath + "/maxChars", schemaPath: "#/definitions/ReadFileInput/properties/maxChars/maximum", keyword: "maximum", params: { comparison: "<=", limit: 5e4 }, message: "must be <= 50000" };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
            if (data3 < 1 || isNaN(data3)) {
              const err11 = { instancePath: instancePath + "/maxChars", schemaPath: "#/definitions/ReadFileInput/properties/maxChars/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
          }
        }
        if (data.cursor !== void 0) {
          if (typeof data.cursor !== "string") {
            const err12 = { instancePath: instancePath + "/cursor", schemaPath: "#/definitions/ReadFileInput/properties/cursor/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
      } else {
        const err13 = { instancePath, schemaPath: "#/definitions/ReadFileInput/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
      validate10.errors = vErrors;
      return errors === 0;
    }
  }
});
export default require_ReadFileInput_validator();
