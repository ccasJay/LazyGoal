var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// SessionMetricsSnapshot-validator.cjs
var require_SessionMetricsSnapshot_validator = __commonJS({
  "SessionMetricsSnapshot-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema12 = { "type": "object", "properties": { "stepCount": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "reportedCalls": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "missingCalls": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "inputTokens": { "type": ["number", "null"] }, "outputTokens": { "type": ["number", "null"] }, "coverage": { "$ref": "#/definitions/MetricsCoverage" }, "cacheMeasuredCalls": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "cacheExcludedCalls": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "cacheHitRate": { "type": ["number", "null"] }, "throughputMeasuredCalls": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "throughputExcludedCalls": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "tokensPerSecond": { "type": ["number", "null"] }, "goalId": { "type": "string", "pattern": "\\S" }, "roundCount": { "type": "integer", "maximum": 9007199254740991 }, "contextUsage": { "anyOf": [{ "$ref": "#/definitions/SessionMetricsContextUsage" }, { "type": "null" }], "description": "\u5F53\u524D\u5DE5\u4F5C\u7A97\u53E3\u5360\u7528\uFF1B\u5BB9\u91CF\u6216\u5360\u7528\u4E0D\u53EF\u7528\u65F6\u7701\u7565\u4E3A `null`\u3002" }, "runs": { "type": "array", "items": { "$ref": "#/definitions/RunSessionMetrics" } } }, "required": ["cacheExcludedCalls", "cacheHitRate", "cacheMeasuredCalls", "coverage", "goalId", "inputTokens", "missingCalls", "outputTokens", "reportedCalls", "roundCount", "runs", "stepCount", "throughputExcludedCalls", "throughputMeasuredCalls", "tokensPerSecond"], "additionalProperties": false };
    var schema13 = { "type": "string", "enum": ["complete", "partial", "unavailable"], "description": "\u6307\u6807\u8986\u76D6\u5EA6\u5206\u7C7B\u3002" };
    var schema14 = { "type": "object", "properties": { "usedPercent": { "type": "number", "description": "\u5DF2\u7528\u6BD4\u4F8B\uFF080\u20131\uFF09\uFF1B\u8D85\u8FC7\u5BB9\u91CF\u65F6\u622A\u65AD\u4E3A 1\u3002" }, "capacityTokens": { "type": "number", "description": "\u5BB9\u91CF\u57FA\u6570\uFF08Token\uFF09\uFF1B\u5FC5\u987B\u4E3A\u6B63\u7684\u5B89\u5168\u6574\u6570\u3002" }, "source": { "type": "string", "enum": ["model", "configured"], "description": "\u5BB9\u91CF\u57FA\u6570\u6765\u6E90\uFF1A\u6A21\u578B\u6807\u79F0\u7A97\u53E3\u6216\u7528\u6237\u914D\u7F6E\u3002" }, "estimated": { "type": "boolean", "description": "\u5360\u7528\u662F\u5426\u6765\u81EA\u672C\u5730\u4F30\u7B97\u800C\u4E0D\u662F\u4F9B\u5E94\u5546\u4E0A\u62A5\u3002" } }, "required": ["usedPercent", "capacityTokens", "source", "estimated"], "additionalProperties": false, "description": "\u5F53\u524D\u5DE5\u4F5C\u7A97\u53E3\u7684\u5360\u7528\u7ED3\u7B97\u3002" };
    var func2 = Object.prototype.hasOwnProperty;
    var pattern0 = new RegExp("\\S", "u");
    var schema15 = { "type": "object", "properties": { "stepCount": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "reportedCalls": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "missingCalls": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "inputTokens": { "type": ["number", "null"] }, "outputTokens": { "type": ["number", "null"] }, "coverage": { "$ref": "#/definitions/MetricsCoverage" }, "cacheMeasuredCalls": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "cacheExcludedCalls": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "cacheHitRate": { "type": ["number", "null"] }, "throughputMeasuredCalls": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "throughputExcludedCalls": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "tokensPerSecond": { "type": ["number", "null"] }, "runId": { "type": "string", "pattern": "\\S" } }, "required": ["cacheExcludedCalls", "cacheHitRate", "cacheMeasuredCalls", "coverage", "inputTokens", "missingCalls", "outputTokens", "reportedCalls", "runId", "stepCount", "throughputExcludedCalls", "throughputMeasuredCalls", "tokensPerSecond"], "additionalProperties": false, "description": "\u5355\u4E2A Run \u7684\u6A21\u578B\u7528\u91CF\u4E0E\u6B65\u6570\u7EDF\u8BA1\u3002" };
    function validate12(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.cacheExcludedCalls === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "cacheExcludedCalls" }, message: "must have required property 'cacheExcludedCalls'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.cacheHitRate === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "cacheHitRate" }, message: "must have required property 'cacheHitRate'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.cacheMeasuredCalls === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "cacheMeasuredCalls" }, message: "must have required property 'cacheMeasuredCalls'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.coverage === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "coverage" }, message: "must have required property 'coverage'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.inputTokens === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "inputTokens" }, message: "must have required property 'inputTokens'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data.missingCalls === void 0) {
          const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "missingCalls" }, message: "must have required property 'missingCalls'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        if (data.outputTokens === void 0) {
          const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "outputTokens" }, message: "must have required property 'outputTokens'" };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        if (data.reportedCalls === void 0) {
          const err7 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "reportedCalls" }, message: "must have required property 'reportedCalls'" };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        if (data.runId === void 0) {
          const err8 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
        if (data.stepCount === void 0) {
          const err9 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "stepCount" }, message: "must have required property 'stepCount'" };
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
        if (data.throughputMeasuredCalls === void 0) {
          const err11 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "throughputMeasuredCalls" }, message: "must have required property 'throughputMeasuredCalls'" };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
        if (data.tokensPerSecond === void 0) {
          const err12 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "tokensPerSecond" }, message: "must have required property 'tokensPerSecond'" };
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!func2.call(schema15.properties, key0)) {
            const err13 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        }
        if (data.stepCount !== void 0) {
          let data0 = data.stepCount;
          if (!(typeof data0 == "number" && (!(data0 % 1) && !isNaN(data0)) && isFinite(data0))) {
            const err14 = { instancePath: instancePath + "/stepCount", schemaPath: "#/properties/stepCount/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
          if (typeof data0 == "number" && isFinite(data0)) {
            if (data0 > 9007199254740991 || isNaN(data0)) {
              const err15 = { instancePath: instancePath + "/stepCount", schemaPath: "#/properties/stepCount/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
            if (data0 < 0 || isNaN(data0)) {
              const err16 = { instancePath: instancePath + "/stepCount", schemaPath: "#/properties/stepCount/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err16];
              } else {
                vErrors.push(err16);
              }
              errors++;
            }
          }
        }
        if (data.reportedCalls !== void 0) {
          let data1 = data.reportedCalls;
          if (!(typeof data1 == "number" && (!(data1 % 1) && !isNaN(data1)) && isFinite(data1))) {
            const err17 = { instancePath: instancePath + "/reportedCalls", schemaPath: "#/properties/reportedCalls/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
          if (typeof data1 == "number" && isFinite(data1)) {
            if (data1 > 9007199254740991 || isNaN(data1)) {
              const err18 = { instancePath: instancePath + "/reportedCalls", schemaPath: "#/properties/reportedCalls/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
            if (data1 < 0 || isNaN(data1)) {
              const err19 = { instancePath: instancePath + "/reportedCalls", schemaPath: "#/properties/reportedCalls/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            }
          }
        }
        if (data.missingCalls !== void 0) {
          let data2 = data.missingCalls;
          if (!(typeof data2 == "number" && (!(data2 % 1) && !isNaN(data2)) && isFinite(data2))) {
            const err20 = { instancePath: instancePath + "/missingCalls", schemaPath: "#/properties/missingCalls/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err20];
            } else {
              vErrors.push(err20);
            }
            errors++;
          }
          if (typeof data2 == "number" && isFinite(data2)) {
            if (data2 > 9007199254740991 || isNaN(data2)) {
              const err21 = { instancePath: instancePath + "/missingCalls", schemaPath: "#/properties/missingCalls/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            }
            if (data2 < 0 || isNaN(data2)) {
              const err22 = { instancePath: instancePath + "/missingCalls", schemaPath: "#/properties/missingCalls/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err22];
              } else {
                vErrors.push(err22);
              }
              errors++;
            }
          }
        }
        if (data.inputTokens !== void 0) {
          let data3 = data.inputTokens;
          if (!(typeof data3 == "number" && isFinite(data3)) && data3 !== null) {
            const err23 = { instancePath: instancePath + "/inputTokens", schemaPath: "#/properties/inputTokens/type", keyword: "type", params: { type: schema15.properties.inputTokens.type }, message: "must be number,null" };
            if (vErrors === null) {
              vErrors = [err23];
            } else {
              vErrors.push(err23);
            }
            errors++;
          }
        }
        if (data.outputTokens !== void 0) {
          let data4 = data.outputTokens;
          if (!(typeof data4 == "number" && isFinite(data4)) && data4 !== null) {
            const err24 = { instancePath: instancePath + "/outputTokens", schemaPath: "#/properties/outputTokens/type", keyword: "type", params: { type: schema15.properties.outputTokens.type }, message: "must be number,null" };
            if (vErrors === null) {
              vErrors = [err24];
            } else {
              vErrors.push(err24);
            }
            errors++;
          }
        }
        if (data.coverage !== void 0) {
          let data5 = data.coverage;
          if (typeof data5 !== "string") {
            const err25 = { instancePath: instancePath + "/coverage", schemaPath: "#/definitions/MetricsCoverage/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err25];
            } else {
              vErrors.push(err25);
            }
            errors++;
          }
          if (!(data5 === "complete" || data5 === "partial" || data5 === "unavailable")) {
            const err26 = { instancePath: instancePath + "/coverage", schemaPath: "#/definitions/MetricsCoverage/enum", keyword: "enum", params: { allowedValues: schema13.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err26];
            } else {
              vErrors.push(err26);
            }
            errors++;
          }
        }
        if (data.cacheMeasuredCalls !== void 0) {
          let data6 = data.cacheMeasuredCalls;
          if (!(typeof data6 == "number" && (!(data6 % 1) && !isNaN(data6)) && isFinite(data6))) {
            const err27 = { instancePath: instancePath + "/cacheMeasuredCalls", schemaPath: "#/properties/cacheMeasuredCalls/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err27];
            } else {
              vErrors.push(err27);
            }
            errors++;
          }
          if (typeof data6 == "number" && isFinite(data6)) {
            if (data6 > 9007199254740991 || isNaN(data6)) {
              const err28 = { instancePath: instancePath + "/cacheMeasuredCalls", schemaPath: "#/properties/cacheMeasuredCalls/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err28];
              } else {
                vErrors.push(err28);
              }
              errors++;
            }
            if (data6 < 0 || isNaN(data6)) {
              const err29 = { instancePath: instancePath + "/cacheMeasuredCalls", schemaPath: "#/properties/cacheMeasuredCalls/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err29];
              } else {
                vErrors.push(err29);
              }
              errors++;
            }
          }
        }
        if (data.cacheExcludedCalls !== void 0) {
          let data7 = data.cacheExcludedCalls;
          if (!(typeof data7 == "number" && (!(data7 % 1) && !isNaN(data7)) && isFinite(data7))) {
            const err30 = { instancePath: instancePath + "/cacheExcludedCalls", schemaPath: "#/properties/cacheExcludedCalls/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err30];
            } else {
              vErrors.push(err30);
            }
            errors++;
          }
          if (typeof data7 == "number" && isFinite(data7)) {
            if (data7 > 9007199254740991 || isNaN(data7)) {
              const err31 = { instancePath: instancePath + "/cacheExcludedCalls", schemaPath: "#/properties/cacheExcludedCalls/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err31];
              } else {
                vErrors.push(err31);
              }
              errors++;
            }
            if (data7 < 0 || isNaN(data7)) {
              const err32 = { instancePath: instancePath + "/cacheExcludedCalls", schemaPath: "#/properties/cacheExcludedCalls/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err32];
              } else {
                vErrors.push(err32);
              }
              errors++;
            }
          }
        }
        if (data.cacheHitRate !== void 0) {
          let data8 = data.cacheHitRate;
          if (!(typeof data8 == "number" && isFinite(data8)) && data8 !== null) {
            const err33 = { instancePath: instancePath + "/cacheHitRate", schemaPath: "#/properties/cacheHitRate/type", keyword: "type", params: { type: schema15.properties.cacheHitRate.type }, message: "must be number,null" };
            if (vErrors === null) {
              vErrors = [err33];
            } else {
              vErrors.push(err33);
            }
            errors++;
          }
        }
        if (data.throughputMeasuredCalls !== void 0) {
          let data9 = data.throughputMeasuredCalls;
          if (!(typeof data9 == "number" && (!(data9 % 1) && !isNaN(data9)) && isFinite(data9))) {
            const err34 = { instancePath: instancePath + "/throughputMeasuredCalls", schemaPath: "#/properties/throughputMeasuredCalls/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err34];
            } else {
              vErrors.push(err34);
            }
            errors++;
          }
          if (typeof data9 == "number" && isFinite(data9)) {
            if (data9 > 9007199254740991 || isNaN(data9)) {
              const err35 = { instancePath: instancePath + "/throughputMeasuredCalls", schemaPath: "#/properties/throughputMeasuredCalls/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err35];
              } else {
                vErrors.push(err35);
              }
              errors++;
            }
            if (data9 < 0 || isNaN(data9)) {
              const err36 = { instancePath: instancePath + "/throughputMeasuredCalls", schemaPath: "#/properties/throughputMeasuredCalls/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err36];
              } else {
                vErrors.push(err36);
              }
              errors++;
            }
          }
        }
        if (data.throughputExcludedCalls !== void 0) {
          let data10 = data.throughputExcludedCalls;
          if (!(typeof data10 == "number" && (!(data10 % 1) && !isNaN(data10)) && isFinite(data10))) {
            const err37 = { instancePath: instancePath + "/throughputExcludedCalls", schemaPath: "#/properties/throughputExcludedCalls/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err37];
            } else {
              vErrors.push(err37);
            }
            errors++;
          }
          if (typeof data10 == "number" && isFinite(data10)) {
            if (data10 > 9007199254740991 || isNaN(data10)) {
              const err38 = { instancePath: instancePath + "/throughputExcludedCalls", schemaPath: "#/properties/throughputExcludedCalls/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err38];
              } else {
                vErrors.push(err38);
              }
              errors++;
            }
            if (data10 < 0 || isNaN(data10)) {
              const err39 = { instancePath: instancePath + "/throughputExcludedCalls", schemaPath: "#/properties/throughputExcludedCalls/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err39];
              } else {
                vErrors.push(err39);
              }
              errors++;
            }
          }
        }
        if (data.tokensPerSecond !== void 0) {
          let data11 = data.tokensPerSecond;
          if (!(typeof data11 == "number" && isFinite(data11)) && data11 !== null) {
            const err40 = { instancePath: instancePath + "/tokensPerSecond", schemaPath: "#/properties/tokensPerSecond/type", keyword: "type", params: { type: schema15.properties.tokensPerSecond.type }, message: "must be number,null" };
            if (vErrors === null) {
              vErrors = [err40];
            } else {
              vErrors.push(err40);
            }
            errors++;
          }
        }
        if (data.runId !== void 0) {
          let data12 = data.runId;
          if (typeof data12 === "string") {
            if (!pattern0.test(data12)) {
              const err41 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err41];
              } else {
                vErrors.push(err41);
              }
              errors++;
            }
          } else {
            const err42 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err42];
            } else {
              vErrors.push(err42);
            }
            errors++;
          }
        }
      } else {
        const err43 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err43];
        } else {
          vErrors.push(err43);
        }
        errors++;
      }
      validate12.errors = vErrors;
      return errors === 0;
    }
    function validate11(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.cacheExcludedCalls === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "cacheExcludedCalls" }, message: "must have required property 'cacheExcludedCalls'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.cacheHitRate === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "cacheHitRate" }, message: "must have required property 'cacheHitRate'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.cacheMeasuredCalls === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "cacheMeasuredCalls" }, message: "must have required property 'cacheMeasuredCalls'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.coverage === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "coverage" }, message: "must have required property 'coverage'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.goalId === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data.inputTokens === void 0) {
          const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "inputTokens" }, message: "must have required property 'inputTokens'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        if (data.missingCalls === void 0) {
          const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "missingCalls" }, message: "must have required property 'missingCalls'" };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        if (data.outputTokens === void 0) {
          const err7 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "outputTokens" }, message: "must have required property 'outputTokens'" };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        if (data.reportedCalls === void 0) {
          const err8 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "reportedCalls" }, message: "must have required property 'reportedCalls'" };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
        if (data.roundCount === void 0) {
          const err9 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "roundCount" }, message: "must have required property 'roundCount'" };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
        if (data.runs === void 0) {
          const err10 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "runs" }, message: "must have required property 'runs'" };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
        if (data.stepCount === void 0) {
          const err11 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "stepCount" }, message: "must have required property 'stepCount'" };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
        if (data.throughputExcludedCalls === void 0) {
          const err12 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "throughputExcludedCalls" }, message: "must have required property 'throughputExcludedCalls'" };
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        }
        if (data.throughputMeasuredCalls === void 0) {
          const err13 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "throughputMeasuredCalls" }, message: "must have required property 'throughputMeasuredCalls'" };
          if (vErrors === null) {
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        }
        if (data.tokensPerSecond === void 0) {
          const err14 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "tokensPerSecond" }, message: "must have required property 'tokensPerSecond'" };
          if (vErrors === null) {
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!func2.call(schema12.properties, key0)) {
            const err15 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
        }
        if (data.stepCount !== void 0) {
          let data0 = data.stepCount;
          if (!(typeof data0 == "number" && (!(data0 % 1) && !isNaN(data0)) && isFinite(data0))) {
            const err16 = { instancePath: instancePath + "/stepCount", schemaPath: "#/properties/stepCount/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
          if (typeof data0 == "number" && isFinite(data0)) {
            if (data0 > 9007199254740991 || isNaN(data0)) {
              const err17 = { instancePath: instancePath + "/stepCount", schemaPath: "#/properties/stepCount/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
            if (data0 < 0 || isNaN(data0)) {
              const err18 = { instancePath: instancePath + "/stepCount", schemaPath: "#/properties/stepCount/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
          }
        }
        if (data.reportedCalls !== void 0) {
          let data1 = data.reportedCalls;
          if (!(typeof data1 == "number" && (!(data1 % 1) && !isNaN(data1)) && isFinite(data1))) {
            const err19 = { instancePath: instancePath + "/reportedCalls", schemaPath: "#/properties/reportedCalls/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          }
          if (typeof data1 == "number" && isFinite(data1)) {
            if (data1 > 9007199254740991 || isNaN(data1)) {
              const err20 = { instancePath: instancePath + "/reportedCalls", schemaPath: "#/properties/reportedCalls/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err20];
              } else {
                vErrors.push(err20);
              }
              errors++;
            }
            if (data1 < 0 || isNaN(data1)) {
              const err21 = { instancePath: instancePath + "/reportedCalls", schemaPath: "#/properties/reportedCalls/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            }
          }
        }
        if (data.missingCalls !== void 0) {
          let data2 = data.missingCalls;
          if (!(typeof data2 == "number" && (!(data2 % 1) && !isNaN(data2)) && isFinite(data2))) {
            const err22 = { instancePath: instancePath + "/missingCalls", schemaPath: "#/properties/missingCalls/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err22];
            } else {
              vErrors.push(err22);
            }
            errors++;
          }
          if (typeof data2 == "number" && isFinite(data2)) {
            if (data2 > 9007199254740991 || isNaN(data2)) {
              const err23 = { instancePath: instancePath + "/missingCalls", schemaPath: "#/properties/missingCalls/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err23];
              } else {
                vErrors.push(err23);
              }
              errors++;
            }
            if (data2 < 0 || isNaN(data2)) {
              const err24 = { instancePath: instancePath + "/missingCalls", schemaPath: "#/properties/missingCalls/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err24];
              } else {
                vErrors.push(err24);
              }
              errors++;
            }
          }
        }
        if (data.inputTokens !== void 0) {
          let data3 = data.inputTokens;
          if (!(typeof data3 == "number" && isFinite(data3)) && data3 !== null) {
            const err25 = { instancePath: instancePath + "/inputTokens", schemaPath: "#/properties/inputTokens/type", keyword: "type", params: { type: schema12.properties.inputTokens.type }, message: "must be number,null" };
            if (vErrors === null) {
              vErrors = [err25];
            } else {
              vErrors.push(err25);
            }
            errors++;
          }
        }
        if (data.outputTokens !== void 0) {
          let data4 = data.outputTokens;
          if (!(typeof data4 == "number" && isFinite(data4)) && data4 !== null) {
            const err26 = { instancePath: instancePath + "/outputTokens", schemaPath: "#/properties/outputTokens/type", keyword: "type", params: { type: schema12.properties.outputTokens.type }, message: "must be number,null" };
            if (vErrors === null) {
              vErrors = [err26];
            } else {
              vErrors.push(err26);
            }
            errors++;
          }
        }
        if (data.coverage !== void 0) {
          let data5 = data.coverage;
          if (typeof data5 !== "string") {
            const err27 = { instancePath: instancePath + "/coverage", schemaPath: "#/definitions/MetricsCoverage/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err27];
            } else {
              vErrors.push(err27);
            }
            errors++;
          }
          if (!(data5 === "complete" || data5 === "partial" || data5 === "unavailable")) {
            const err28 = { instancePath: instancePath + "/coverage", schemaPath: "#/definitions/MetricsCoverage/enum", keyword: "enum", params: { allowedValues: schema13.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err28];
            } else {
              vErrors.push(err28);
            }
            errors++;
          }
        }
        if (data.cacheMeasuredCalls !== void 0) {
          let data6 = data.cacheMeasuredCalls;
          if (!(typeof data6 == "number" && (!(data6 % 1) && !isNaN(data6)) && isFinite(data6))) {
            const err29 = { instancePath: instancePath + "/cacheMeasuredCalls", schemaPath: "#/properties/cacheMeasuredCalls/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err29];
            } else {
              vErrors.push(err29);
            }
            errors++;
          }
          if (typeof data6 == "number" && isFinite(data6)) {
            if (data6 > 9007199254740991 || isNaN(data6)) {
              const err30 = { instancePath: instancePath + "/cacheMeasuredCalls", schemaPath: "#/properties/cacheMeasuredCalls/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err30];
              } else {
                vErrors.push(err30);
              }
              errors++;
            }
            if (data6 < 0 || isNaN(data6)) {
              const err31 = { instancePath: instancePath + "/cacheMeasuredCalls", schemaPath: "#/properties/cacheMeasuredCalls/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err31];
              } else {
                vErrors.push(err31);
              }
              errors++;
            }
          }
        }
        if (data.cacheExcludedCalls !== void 0) {
          let data7 = data.cacheExcludedCalls;
          if (!(typeof data7 == "number" && (!(data7 % 1) && !isNaN(data7)) && isFinite(data7))) {
            const err32 = { instancePath: instancePath + "/cacheExcludedCalls", schemaPath: "#/properties/cacheExcludedCalls/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err32];
            } else {
              vErrors.push(err32);
            }
            errors++;
          }
          if (typeof data7 == "number" && isFinite(data7)) {
            if (data7 > 9007199254740991 || isNaN(data7)) {
              const err33 = { instancePath: instancePath + "/cacheExcludedCalls", schemaPath: "#/properties/cacheExcludedCalls/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err33];
              } else {
                vErrors.push(err33);
              }
              errors++;
            }
            if (data7 < 0 || isNaN(data7)) {
              const err34 = { instancePath: instancePath + "/cacheExcludedCalls", schemaPath: "#/properties/cacheExcludedCalls/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err34];
              } else {
                vErrors.push(err34);
              }
              errors++;
            }
          }
        }
        if (data.cacheHitRate !== void 0) {
          let data8 = data.cacheHitRate;
          if (!(typeof data8 == "number" && isFinite(data8)) && data8 !== null) {
            const err35 = { instancePath: instancePath + "/cacheHitRate", schemaPath: "#/properties/cacheHitRate/type", keyword: "type", params: { type: schema12.properties.cacheHitRate.type }, message: "must be number,null" };
            if (vErrors === null) {
              vErrors = [err35];
            } else {
              vErrors.push(err35);
            }
            errors++;
          }
        }
        if (data.throughputMeasuredCalls !== void 0) {
          let data9 = data.throughputMeasuredCalls;
          if (!(typeof data9 == "number" && (!(data9 % 1) && !isNaN(data9)) && isFinite(data9))) {
            const err36 = { instancePath: instancePath + "/throughputMeasuredCalls", schemaPath: "#/properties/throughputMeasuredCalls/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err36];
            } else {
              vErrors.push(err36);
            }
            errors++;
          }
          if (typeof data9 == "number" && isFinite(data9)) {
            if (data9 > 9007199254740991 || isNaN(data9)) {
              const err37 = { instancePath: instancePath + "/throughputMeasuredCalls", schemaPath: "#/properties/throughputMeasuredCalls/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err37];
              } else {
                vErrors.push(err37);
              }
              errors++;
            }
            if (data9 < 0 || isNaN(data9)) {
              const err38 = { instancePath: instancePath + "/throughputMeasuredCalls", schemaPath: "#/properties/throughputMeasuredCalls/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err38];
              } else {
                vErrors.push(err38);
              }
              errors++;
            }
          }
        }
        if (data.throughputExcludedCalls !== void 0) {
          let data10 = data.throughputExcludedCalls;
          if (!(typeof data10 == "number" && (!(data10 % 1) && !isNaN(data10)) && isFinite(data10))) {
            const err39 = { instancePath: instancePath + "/throughputExcludedCalls", schemaPath: "#/properties/throughputExcludedCalls/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err39];
            } else {
              vErrors.push(err39);
            }
            errors++;
          }
          if (typeof data10 == "number" && isFinite(data10)) {
            if (data10 > 9007199254740991 || isNaN(data10)) {
              const err40 = { instancePath: instancePath + "/throughputExcludedCalls", schemaPath: "#/properties/throughputExcludedCalls/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err40];
              } else {
                vErrors.push(err40);
              }
              errors++;
            }
            if (data10 < 0 || isNaN(data10)) {
              const err41 = { instancePath: instancePath + "/throughputExcludedCalls", schemaPath: "#/properties/throughputExcludedCalls/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err41];
              } else {
                vErrors.push(err41);
              }
              errors++;
            }
          }
        }
        if (data.tokensPerSecond !== void 0) {
          let data11 = data.tokensPerSecond;
          if (!(typeof data11 == "number" && isFinite(data11)) && data11 !== null) {
            const err42 = { instancePath: instancePath + "/tokensPerSecond", schemaPath: "#/properties/tokensPerSecond/type", keyword: "type", params: { type: schema12.properties.tokensPerSecond.type }, message: "must be number,null" };
            if (vErrors === null) {
              vErrors = [err42];
            } else {
              vErrors.push(err42);
            }
            errors++;
          }
        }
        if (data.goalId !== void 0) {
          let data12 = data.goalId;
          if (typeof data12 === "string") {
            if (!pattern0.test(data12)) {
              const err43 = { instancePath: instancePath + "/goalId", schemaPath: "#/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err43];
              } else {
                vErrors.push(err43);
              }
              errors++;
            }
          } else {
            const err44 = { instancePath: instancePath + "/goalId", schemaPath: "#/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err44];
            } else {
              vErrors.push(err44);
            }
            errors++;
          }
        }
        if (data.roundCount !== void 0) {
          let data13 = data.roundCount;
          if (!(typeof data13 == "number" && (!(data13 % 1) && !isNaN(data13)) && isFinite(data13))) {
            const err45 = { instancePath: instancePath + "/roundCount", schemaPath: "#/properties/roundCount/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err45];
            } else {
              vErrors.push(err45);
            }
            errors++;
          }
          if (typeof data13 == "number" && isFinite(data13)) {
            if (data13 > 9007199254740991 || isNaN(data13)) {
              const err46 = { instancePath: instancePath + "/roundCount", schemaPath: "#/properties/roundCount/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err46];
              } else {
                vErrors.push(err46);
              }
              errors++;
            }
          }
        }
        if (data.contextUsage !== void 0) {
          let data14 = data.contextUsage;
          const _errs32 = errors;
          let valid2 = false;
          const _errs33 = errors;
          if (data14 && typeof data14 == "object" && !Array.isArray(data14)) {
            if (data14.usedPercent === void 0) {
              const err47 = { instancePath: instancePath + "/contextUsage", schemaPath: "#/definitions/SessionMetricsContextUsage/required", keyword: "required", params: { missingProperty: "usedPercent" }, message: "must have required property 'usedPercent'" };
              if (vErrors === null) {
                vErrors = [err47];
              } else {
                vErrors.push(err47);
              }
              errors++;
            }
            if (data14.capacityTokens === void 0) {
              const err48 = { instancePath: instancePath + "/contextUsage", schemaPath: "#/definitions/SessionMetricsContextUsage/required", keyword: "required", params: { missingProperty: "capacityTokens" }, message: "must have required property 'capacityTokens'" };
              if (vErrors === null) {
                vErrors = [err48];
              } else {
                vErrors.push(err48);
              }
              errors++;
            }
            if (data14.source === void 0) {
              const err49 = { instancePath: instancePath + "/contextUsage", schemaPath: "#/definitions/SessionMetricsContextUsage/required", keyword: "required", params: { missingProperty: "source" }, message: "must have required property 'source'" };
              if (vErrors === null) {
                vErrors = [err49];
              } else {
                vErrors.push(err49);
              }
              errors++;
            }
            if (data14.estimated === void 0) {
              const err50 = { instancePath: instancePath + "/contextUsage", schemaPath: "#/definitions/SessionMetricsContextUsage/required", keyword: "required", params: { missingProperty: "estimated" }, message: "must have required property 'estimated'" };
              if (vErrors === null) {
                vErrors = [err50];
              } else {
                vErrors.push(err50);
              }
              errors++;
            }
            for (const key1 in data14) {
              if (!(key1 === "usedPercent" || key1 === "capacityTokens" || key1 === "source" || key1 === "estimated")) {
                const err51 = { instancePath: instancePath + "/contextUsage", schemaPath: "#/definitions/SessionMetricsContextUsage/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err51];
                } else {
                  vErrors.push(err51);
                }
                errors++;
              }
            }
            if (data14.usedPercent !== void 0) {
              let data15 = data14.usedPercent;
              if (!(typeof data15 == "number" && isFinite(data15))) {
                const err52 = { instancePath: instancePath + "/contextUsage/usedPercent", schemaPath: "#/definitions/SessionMetricsContextUsage/properties/usedPercent/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                if (vErrors === null) {
                  vErrors = [err52];
                } else {
                  vErrors.push(err52);
                }
                errors++;
              }
            }
            if (data14.capacityTokens !== void 0) {
              let data16 = data14.capacityTokens;
              if (!(typeof data16 == "number" && isFinite(data16))) {
                const err53 = { instancePath: instancePath + "/contextUsage/capacityTokens", schemaPath: "#/definitions/SessionMetricsContextUsage/properties/capacityTokens/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                if (vErrors === null) {
                  vErrors = [err53];
                } else {
                  vErrors.push(err53);
                }
                errors++;
              }
            }
            if (data14.source !== void 0) {
              let data17 = data14.source;
              if (typeof data17 !== "string") {
                const err54 = { instancePath: instancePath + "/contextUsage/source", schemaPath: "#/definitions/SessionMetricsContextUsage/properties/source/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err54];
                } else {
                  vErrors.push(err54);
                }
                errors++;
              }
              if (!(data17 === "model" || data17 === "configured")) {
                const err55 = { instancePath: instancePath + "/contextUsage/source", schemaPath: "#/definitions/SessionMetricsContextUsage/properties/source/enum", keyword: "enum", params: { allowedValues: schema14.properties.source.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err55];
                } else {
                  vErrors.push(err55);
                }
                errors++;
              }
            }
            if (data14.estimated !== void 0) {
              if (typeof data14.estimated !== "boolean") {
                const err56 = { instancePath: instancePath + "/contextUsage/estimated", schemaPath: "#/definitions/SessionMetricsContextUsage/properties/estimated/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                if (vErrors === null) {
                  vErrors = [err56];
                } else {
                  vErrors.push(err56);
                }
                errors++;
              }
            }
          } else {
            const err57 = { instancePath: instancePath + "/contextUsage", schemaPath: "#/definitions/SessionMetricsContextUsage/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err57];
            } else {
              vErrors.push(err57);
            }
            errors++;
          }
          var _valid0 = _errs33 === errors;
          valid2 = valid2 || _valid0;
          if (!valid2) {
            const _errs45 = errors;
            if (data14 !== null) {
              const err58 = { instancePath: instancePath + "/contextUsage", schemaPath: "#/properties/contextUsage/anyOf/1/type", keyword: "type", params: { type: "null" }, message: "must be null" };
              if (vErrors === null) {
                vErrors = [err58];
              } else {
                vErrors.push(err58);
              }
              errors++;
            }
            var _valid0 = _errs45 === errors;
            valid2 = valid2 || _valid0;
          }
          if (!valid2) {
            const err59 = { instancePath: instancePath + "/contextUsage", schemaPath: "#/properties/contextUsage/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
            if (vErrors === null) {
              vErrors = [err59];
            } else {
              vErrors.push(err59);
            }
            errors++;
          } else {
            errors = _errs32;
            if (vErrors !== null) {
              if (_errs32) {
                vErrors.length = _errs32;
              } else {
                vErrors = null;
              }
            }
          }
        }
        if (data.runs !== void 0) {
          let data19 = data.runs;
          if (Array.isArray(data19)) {
            const len0 = data19.length;
            for (let i0 = 0; i0 < len0; i0++) {
              if (!validate12(data19[i0], { instancePath: instancePath + "/runs/" + i0, parentData: data19, parentDataProperty: i0, rootData })) {
                vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                errors = vErrors.length;
              }
            }
          } else {
            const err60 = { instancePath: instancePath + "/runs", schemaPath: "#/properties/runs/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err60];
            } else {
              vErrors.push(err60);
            }
            errors++;
          }
        }
      } else {
        const err61 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err61];
        } else {
          vErrors.push(err61);
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
export default require_SessionMetricsSnapshot_validator();
