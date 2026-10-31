var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// SessionMetricsValues-validator.cjs
var require_SessionMetricsValues_validator = __commonJS({
  "SessionMetricsValues-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema12 = { "type": "object", "properties": { "stepCount": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "reportedCalls": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "missingCalls": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "inputTokens": { "type": ["number", "null"] }, "outputTokens": { "type": ["number", "null"] }, "coverage": { "$ref": "#/definitions/MetricsCoverage" }, "cacheMeasuredCalls": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "cacheExcludedCalls": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "cacheHitRate": { "type": ["number", "null"] }, "throughputMeasuredCalls": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "throughputExcludedCalls": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "tokensPerSecond": { "type": ["number", "null"] } }, "required": ["stepCount", "reportedCalls", "missingCalls", "inputTokens", "outputTokens", "coverage", "cacheMeasuredCalls", "cacheExcludedCalls", "cacheHitRate", "throughputMeasuredCalls", "throughputExcludedCalls", "tokensPerSecond"], "additionalProperties": false, "description": "\u5355\u4E2A Run \u4E0E\u5168\u4F1A\u8BDD\u5171\u4EAB\u7684\u6A21\u578B\u7528\u91CF\u5B57\u6BB5\u3002" };
    var schema13 = { "type": "string", "enum": ["complete", "partial", "unavailable"], "description": "\u6307\u6807\u8986\u76D6\u5EA6\u5206\u7C7B\u3002" };
    var func2 = Object.prototype.hasOwnProperty;
    function validate11(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.stepCount === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "stepCount" }, message: "must have required property 'stepCount'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.reportedCalls === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "reportedCalls" }, message: "must have required property 'reportedCalls'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.missingCalls === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "missingCalls" }, message: "must have required property 'missingCalls'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.inputTokens === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "inputTokens" }, message: "must have required property 'inputTokens'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.outputTokens === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "outputTokens" }, message: "must have required property 'outputTokens'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data.coverage === void 0) {
          const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "coverage" }, message: "must have required property 'coverage'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        if (data.cacheMeasuredCalls === void 0) {
          const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "cacheMeasuredCalls" }, message: "must have required property 'cacheMeasuredCalls'" };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        if (data.cacheExcludedCalls === void 0) {
          const err7 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "cacheExcludedCalls" }, message: "must have required property 'cacheExcludedCalls'" };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        if (data.cacheHitRate === void 0) {
          const err8 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "cacheHitRate" }, message: "must have required property 'cacheHitRate'" };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
        if (data.throughputMeasuredCalls === void 0) {
          const err9 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "throughputMeasuredCalls" }, message: "must have required property 'throughputMeasuredCalls'" };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
        if (data.throughputExcludedCalls === void 0) {
          const err10 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "throughputExcludedCalls" }, message: "must have required property 'throughputExcludedCalls'" };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
        if (data.tokensPerSecond === void 0) {
          const err11 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "tokensPerSecond" }, message: "must have required property 'tokensPerSecond'" };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!func2.call(schema12.properties, key0)) {
            const err12 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data.stepCount !== void 0) {
          let data0 = data.stepCount;
          if (!(typeof data0 == "number" && (!(data0 % 1) && !isNaN(data0)) && isFinite(data0))) {
            const err13 = { instancePath: instancePath + "/stepCount", schemaPath: "#/properties/stepCount/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
          if (typeof data0 == "number" && isFinite(data0)) {
            if (data0 > 9007199254740991 || isNaN(data0)) {
              const err14 = { instancePath: instancePath + "/stepCount", schemaPath: "#/properties/stepCount/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
            if (data0 < 0 || isNaN(data0)) {
              const err15 = { instancePath: instancePath + "/stepCount", schemaPath: "#/properties/stepCount/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
          }
        }
        if (data.reportedCalls !== void 0) {
          let data1 = data.reportedCalls;
          if (!(typeof data1 == "number" && (!(data1 % 1) && !isNaN(data1)) && isFinite(data1))) {
            const err16 = { instancePath: instancePath + "/reportedCalls", schemaPath: "#/properties/reportedCalls/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
          if (typeof data1 == "number" && isFinite(data1)) {
            if (data1 > 9007199254740991 || isNaN(data1)) {
              const err17 = { instancePath: instancePath + "/reportedCalls", schemaPath: "#/properties/reportedCalls/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
            if (data1 < 0 || isNaN(data1)) {
              const err18 = { instancePath: instancePath + "/reportedCalls", schemaPath: "#/properties/reportedCalls/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
          }
        }
        if (data.missingCalls !== void 0) {
          let data2 = data.missingCalls;
          if (!(typeof data2 == "number" && (!(data2 % 1) && !isNaN(data2)) && isFinite(data2))) {
            const err19 = { instancePath: instancePath + "/missingCalls", schemaPath: "#/properties/missingCalls/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          }
          if (typeof data2 == "number" && isFinite(data2)) {
            if (data2 > 9007199254740991 || isNaN(data2)) {
              const err20 = { instancePath: instancePath + "/missingCalls", schemaPath: "#/properties/missingCalls/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err20];
              } else {
                vErrors.push(err20);
              }
              errors++;
            }
            if (data2 < 0 || isNaN(data2)) {
              const err21 = { instancePath: instancePath + "/missingCalls", schemaPath: "#/properties/missingCalls/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            }
          }
        }
        if (data.inputTokens !== void 0) {
          let data3 = data.inputTokens;
          if (!(typeof data3 == "number" && isFinite(data3)) && data3 !== null) {
            const err22 = { instancePath: instancePath + "/inputTokens", schemaPath: "#/properties/inputTokens/type", keyword: "type", params: { type: schema12.properties.inputTokens.type }, message: "must be number,null" };
            if (vErrors === null) {
              vErrors = [err22];
            } else {
              vErrors.push(err22);
            }
            errors++;
          }
        }
        if (data.outputTokens !== void 0) {
          let data4 = data.outputTokens;
          if (!(typeof data4 == "number" && isFinite(data4)) && data4 !== null) {
            const err23 = { instancePath: instancePath + "/outputTokens", schemaPath: "#/properties/outputTokens/type", keyword: "type", params: { type: schema12.properties.outputTokens.type }, message: "must be number,null" };
            if (vErrors === null) {
              vErrors = [err23];
            } else {
              vErrors.push(err23);
            }
            errors++;
          }
        }
        if (data.coverage !== void 0) {
          let data5 = data.coverage;
          if (typeof data5 !== "string") {
            const err24 = { instancePath: instancePath + "/coverage", schemaPath: "#/definitions/MetricsCoverage/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err24];
            } else {
              vErrors.push(err24);
            }
            errors++;
          }
          if (!(data5 === "complete" || data5 === "partial" || data5 === "unavailable")) {
            const err25 = { instancePath: instancePath + "/coverage", schemaPath: "#/definitions/MetricsCoverage/enum", keyword: "enum", params: { allowedValues: schema13.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err25];
            } else {
              vErrors.push(err25);
            }
            errors++;
          }
        }
        if (data.cacheMeasuredCalls !== void 0) {
          let data6 = data.cacheMeasuredCalls;
          if (!(typeof data6 == "number" && (!(data6 % 1) && !isNaN(data6)) && isFinite(data6))) {
            const err26 = { instancePath: instancePath + "/cacheMeasuredCalls", schemaPath: "#/properties/cacheMeasuredCalls/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err26];
            } else {
              vErrors.push(err26);
            }
            errors++;
          }
          if (typeof data6 == "number" && isFinite(data6)) {
            if (data6 > 9007199254740991 || isNaN(data6)) {
              const err27 = { instancePath: instancePath + "/cacheMeasuredCalls", schemaPath: "#/properties/cacheMeasuredCalls/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err27];
              } else {
                vErrors.push(err27);
              }
              errors++;
            }
            if (data6 < 0 || isNaN(data6)) {
              const err28 = { instancePath: instancePath + "/cacheMeasuredCalls", schemaPath: "#/properties/cacheMeasuredCalls/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err28];
              } else {
                vErrors.push(err28);
              }
              errors++;
            }
          }
        }
        if (data.cacheExcludedCalls !== void 0) {
          let data7 = data.cacheExcludedCalls;
          if (!(typeof data7 == "number" && (!(data7 % 1) && !isNaN(data7)) && isFinite(data7))) {
            const err29 = { instancePath: instancePath + "/cacheExcludedCalls", schemaPath: "#/properties/cacheExcludedCalls/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err29];
            } else {
              vErrors.push(err29);
            }
            errors++;
          }
          if (typeof data7 == "number" && isFinite(data7)) {
            if (data7 > 9007199254740991 || isNaN(data7)) {
              const err30 = { instancePath: instancePath + "/cacheExcludedCalls", schemaPath: "#/properties/cacheExcludedCalls/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err30];
              } else {
                vErrors.push(err30);
              }
              errors++;
            }
            if (data7 < 0 || isNaN(data7)) {
              const err31 = { instancePath: instancePath + "/cacheExcludedCalls", schemaPath: "#/properties/cacheExcludedCalls/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err31];
              } else {
                vErrors.push(err31);
              }
              errors++;
            }
          }
        }
        if (data.cacheHitRate !== void 0) {
          let data8 = data.cacheHitRate;
          if (!(typeof data8 == "number" && isFinite(data8)) && data8 !== null) {
            const err32 = { instancePath: instancePath + "/cacheHitRate", schemaPath: "#/properties/cacheHitRate/type", keyword: "type", params: { type: schema12.properties.cacheHitRate.type }, message: "must be number,null" };
            if (vErrors === null) {
              vErrors = [err32];
            } else {
              vErrors.push(err32);
            }
            errors++;
          }
        }
        if (data.throughputMeasuredCalls !== void 0) {
          let data9 = data.throughputMeasuredCalls;
          if (!(typeof data9 == "number" && (!(data9 % 1) && !isNaN(data9)) && isFinite(data9))) {
            const err33 = { instancePath: instancePath + "/throughputMeasuredCalls", schemaPath: "#/properties/throughputMeasuredCalls/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err33];
            } else {
              vErrors.push(err33);
            }
            errors++;
          }
          if (typeof data9 == "number" && isFinite(data9)) {
            if (data9 > 9007199254740991 || isNaN(data9)) {
              const err34 = { instancePath: instancePath + "/throughputMeasuredCalls", schemaPath: "#/properties/throughputMeasuredCalls/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err34];
              } else {
                vErrors.push(err34);
              }
              errors++;
            }
            if (data9 < 0 || isNaN(data9)) {
              const err35 = { instancePath: instancePath + "/throughputMeasuredCalls", schemaPath: "#/properties/throughputMeasuredCalls/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err35];
              } else {
                vErrors.push(err35);
              }
              errors++;
            }
          }
        }
        if (data.throughputExcludedCalls !== void 0) {
          let data10 = data.throughputExcludedCalls;
          if (!(typeof data10 == "number" && (!(data10 % 1) && !isNaN(data10)) && isFinite(data10))) {
            const err36 = { instancePath: instancePath + "/throughputExcludedCalls", schemaPath: "#/properties/throughputExcludedCalls/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err36];
            } else {
              vErrors.push(err36);
            }
            errors++;
          }
          if (typeof data10 == "number" && isFinite(data10)) {
            if (data10 > 9007199254740991 || isNaN(data10)) {
              const err37 = { instancePath: instancePath + "/throughputExcludedCalls", schemaPath: "#/properties/throughputExcludedCalls/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err37];
              } else {
                vErrors.push(err37);
              }
              errors++;
            }
            if (data10 < 0 || isNaN(data10)) {
              const err38 = { instancePath: instancePath + "/throughputExcludedCalls", schemaPath: "#/properties/throughputExcludedCalls/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err38];
              } else {
                vErrors.push(err38);
              }
              errors++;
            }
          }
        }
        if (data.tokensPerSecond !== void 0) {
          let data11 = data.tokensPerSecond;
          if (!(typeof data11 == "number" && isFinite(data11)) && data11 !== null) {
            const err39 = { instancePath: instancePath + "/tokensPerSecond", schemaPath: "#/properties/tokensPerSecond/type", keyword: "type", params: { type: schema12.properties.tokensPerSecond.type }, message: "must be number,null" };
            if (vErrors === null) {
              vErrors = [err39];
            } else {
              vErrors.push(err39);
            }
            errors++;
          }
        }
      } else {
        const err40 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err40];
        } else {
          vErrors.push(err40);
        }
        errors++;
      }
      validate11.errors = vErrors;
      return errors === 0;
    }
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      if (!validate11(data, { instancePath, parentData, parentDataProperty, rootData })) {
        vErrors = vErrors === null ? validate11.errors : vErrors.concat(validate11.errors);
        errors = vErrors.length;
      }
      validate10.errors = vErrors;
      return errors === 0;
    }
  }
});
export default require_SessionMetricsValues_validator();
