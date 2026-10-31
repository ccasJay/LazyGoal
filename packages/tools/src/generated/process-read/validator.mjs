var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// ProcessReadInput-validator.cjs
var require_ProcessReadInput_validator = __commonJS({
  "ProcessReadInput-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema12 = { "type": "object", "properties": { "processId": { "type": "string", "description": "\u76EE\u6807\u53D7\u7BA1\u8FDB\u7A0B ID\u3002" }, "cursor": { "type": "integer", "description": "\u8F93\u51FA\u6E38\u6807\u3002", "minimum": 0, "maximum": 9007199254740991 }, "channel": { "type": "string", "enum": ["stdout", "stderr", "both"], "description": "\u8BFB\u53D6\u7684\u8F93\u51FA\u901A\u9053\u3002" }, "waitMs": { "type": "integer", "description": "\u6700\u957F\u7B49\u5F85\u6BEB\u79D2\u6570\u3002", "minimum": 0, "maximum": 3e4 }, "maxChars": { "type": "integer", "description": "\u5355\u901A\u9053\u6700\u591A\u8FD4\u56DE\u7684\u5B57\u7B26\u6570\u3002", "minimum": 1, "maximum": 5e4 } }, "required": ["processId"], "additionalProperties": false, "description": "`process_read` \u7684\u7ED3\u6784\u5316\u8F93\u5165\u3002" };
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.processId === void 0) {
          const err0 = { instancePath, schemaPath: "#/definitions/ProcessReadInput/required", keyword: "required", params: { missingProperty: "processId" }, message: "must have required property 'processId'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "processId" || key0 === "cursor" || key0 === "channel" || key0 === "waitMs" || key0 === "maxChars")) {
            const err1 = { instancePath, schemaPath: "#/definitions/ProcessReadInput/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
        }
        if (data.processId !== void 0) {
          if (typeof data.processId !== "string") {
            const err2 = { instancePath: instancePath + "/processId", schemaPath: "#/definitions/ProcessReadInput/properties/processId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.cursor !== void 0) {
          let data1 = data.cursor;
          if (!(typeof data1 == "number" && (!(data1 % 1) && !isNaN(data1)) && isFinite(data1))) {
            const err3 = { instancePath: instancePath + "/cursor", schemaPath: "#/definitions/ProcessReadInput/properties/cursor/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
          if (typeof data1 == "number" && isFinite(data1)) {
            if (data1 > 9007199254740991 || isNaN(data1)) {
              const err4 = { instancePath: instancePath + "/cursor", schemaPath: "#/definitions/ProcessReadInput/properties/cursor/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err4];
              } else {
                vErrors.push(err4);
              }
              errors++;
            }
            if (data1 < 0 || isNaN(data1)) {
              const err5 = { instancePath: instancePath + "/cursor", schemaPath: "#/definitions/ProcessReadInput/properties/cursor/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err5];
              } else {
                vErrors.push(err5);
              }
              errors++;
            }
          }
        }
        if (data.channel !== void 0) {
          let data2 = data.channel;
          if (typeof data2 !== "string") {
            const err6 = { instancePath: instancePath + "/channel", schemaPath: "#/definitions/ProcessReadInput/properties/channel/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
          if (!(data2 === "stdout" || data2 === "stderr" || data2 === "both")) {
            const err7 = { instancePath: instancePath + "/channel", schemaPath: "#/definitions/ProcessReadInput/properties/channel/enum", keyword: "enum", params: { allowedValues: schema12.properties.channel.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.waitMs !== void 0) {
          let data3 = data.waitMs;
          if (!(typeof data3 == "number" && (!(data3 % 1) && !isNaN(data3)) && isFinite(data3))) {
            const err8 = { instancePath: instancePath + "/waitMs", schemaPath: "#/definitions/ProcessReadInput/properties/waitMs/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
          if (typeof data3 == "number" && isFinite(data3)) {
            if (data3 > 3e4 || isNaN(data3)) {
              const err9 = { instancePath: instancePath + "/waitMs", schemaPath: "#/definitions/ProcessReadInput/properties/waitMs/maximum", keyword: "maximum", params: { comparison: "<=", limit: 3e4 }, message: "must be <= 30000" };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
            if (data3 < 0 || isNaN(data3)) {
              const err10 = { instancePath: instancePath + "/waitMs", schemaPath: "#/definitions/ProcessReadInput/properties/waitMs/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
          }
        }
        if (data.maxChars !== void 0) {
          let data4 = data.maxChars;
          if (!(typeof data4 == "number" && (!(data4 % 1) && !isNaN(data4)) && isFinite(data4))) {
            const err11 = { instancePath: instancePath + "/maxChars", schemaPath: "#/definitions/ProcessReadInput/properties/maxChars/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
          if (typeof data4 == "number" && isFinite(data4)) {
            if (data4 > 5e4 || isNaN(data4)) {
              const err12 = { instancePath: instancePath + "/maxChars", schemaPath: "#/definitions/ProcessReadInput/properties/maxChars/maximum", keyword: "maximum", params: { comparison: "<=", limit: 5e4 }, message: "must be <= 50000" };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
            if (data4 < 1 || isNaN(data4)) {
              const err13 = { instancePath: instancePath + "/maxChars", schemaPath: "#/definitions/ProcessReadInput/properties/maxChars/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
          }
        }
      } else {
        const err14 = { instancePath, schemaPath: "#/definitions/ProcessReadInput/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
      validate10.errors = vErrors;
      return errors === 0;
    }
  }
});
export default require_ProcessReadInput_validator();
