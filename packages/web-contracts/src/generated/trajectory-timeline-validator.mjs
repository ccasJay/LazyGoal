var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// BrowserTrajectoryTimeline-validator.cjs
var require_BrowserTrajectoryTimeline_validator = __commonJS({
  "BrowserTrajectoryTimeline-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var pattern0 = new RegExp("\\S", "u");
    function validate12(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.startSequence === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "startSequence" }, message: "must have required property 'startSequence'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.endSequence === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "endSequence" }, message: "must have required property 'endSequence'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.eventCount === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "eventCount" }, message: "must have required property 'eventCount'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.eventTypes === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "eventTypes" }, message: "must have required property 'eventTypes'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "startSequence" || key0 === "endSequence" || key0 === "eventCount" || key0 === "eventTypes")) {
            const err4 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.startSequence !== void 0) {
          let data0 = data.startSequence;
          if (!(typeof data0 == "number" && (!(data0 % 1) && !isNaN(data0)) && isFinite(data0))) {
            const err5 = { instancePath: instancePath + "/startSequence", schemaPath: "#/properties/startSequence/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
          if (typeof data0 == "number" && isFinite(data0)) {
            if (data0 > 9007199254740991 || isNaN(data0)) {
              const err6 = { instancePath: instancePath + "/startSequence", schemaPath: "#/properties/startSequence/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err6];
              } else {
                vErrors.push(err6);
              }
              errors++;
            }
            if (data0 < 1 || isNaN(data0)) {
              const err7 = { instancePath: instancePath + "/startSequence", schemaPath: "#/properties/startSequence/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
          }
        }
        if (data.endSequence !== void 0) {
          let data1 = data.endSequence;
          if (!(typeof data1 == "number" && (!(data1 % 1) && !isNaN(data1)) && isFinite(data1))) {
            const err8 = { instancePath: instancePath + "/endSequence", schemaPath: "#/properties/endSequence/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
          if (typeof data1 == "number" && isFinite(data1)) {
            if (data1 > 9007199254740991 || isNaN(data1)) {
              const err9 = { instancePath: instancePath + "/endSequence", schemaPath: "#/properties/endSequence/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
            if (data1 < 1 || isNaN(data1)) {
              const err10 = { instancePath: instancePath + "/endSequence", schemaPath: "#/properties/endSequence/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
          }
        }
        if (data.eventCount !== void 0) {
          let data2 = data.eventCount;
          if (!(typeof data2 == "number" && (!(data2 % 1) && !isNaN(data2)) && isFinite(data2))) {
            const err11 = { instancePath: instancePath + "/eventCount", schemaPath: "#/properties/eventCount/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
          if (typeof data2 == "number" && isFinite(data2)) {
            if (data2 > 9007199254740991 || isNaN(data2)) {
              const err12 = { instancePath: instancePath + "/eventCount", schemaPath: "#/properties/eventCount/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
            if (data2 < 0 || isNaN(data2)) {
              const err13 = { instancePath: instancePath + "/eventCount", schemaPath: "#/properties/eventCount/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
          }
        }
        if (data.eventTypes !== void 0) {
          let data3 = data.eventTypes;
          if (Array.isArray(data3)) {
            const len0 = data3.length;
            for (let i0 = 0; i0 < len0; i0++) {
              let data4 = data3[i0];
              if (data4 && typeof data4 == "object" && !Array.isArray(data4)) {
                if (data4.eventType === void 0) {
                  const err14 = { instancePath: instancePath + "/eventTypes/" + i0, schemaPath: "#/definitions/BrowserTrajectoryEventTypeCount/required", keyword: "required", params: { missingProperty: "eventType" }, message: "must have required property 'eventType'" };
                  if (vErrors === null) {
                    vErrors = [err14];
                  } else {
                    vErrors.push(err14);
                  }
                  errors++;
                }
                if (data4.count === void 0) {
                  const err15 = { instancePath: instancePath + "/eventTypes/" + i0, schemaPath: "#/definitions/BrowserTrajectoryEventTypeCount/required", keyword: "required", params: { missingProperty: "count" }, message: "must have required property 'count'" };
                  if (vErrors === null) {
                    vErrors = [err15];
                  } else {
                    vErrors.push(err15);
                  }
                  errors++;
                }
                for (const key1 in data4) {
                  if (!(key1 === "eventType" || key1 === "count")) {
                    const err16 = { instancePath: instancePath + "/eventTypes/" + i0, schemaPath: "#/definitions/BrowserTrajectoryEventTypeCount/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err16];
                    } else {
                      vErrors.push(err16);
                    }
                    errors++;
                  }
                }
                if (data4.eventType !== void 0) {
                  if (typeof data4.eventType !== "string") {
                    const err17 = { instancePath: instancePath + "/eventTypes/" + i0 + "/eventType", schemaPath: "#/definitions/BrowserTrajectoryEventTypeCount/properties/eventType/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err17];
                    } else {
                      vErrors.push(err17);
                    }
                    errors++;
                  }
                }
                if (data4.count !== void 0) {
                  let data6 = data4.count;
                  if (!(typeof data6 == "number" && (!(data6 % 1) && !isNaN(data6)) && isFinite(data6))) {
                    const err18 = { instancePath: instancePath + "/eventTypes/" + i0 + "/count", schemaPath: "#/definitions/BrowserTrajectoryEventTypeCount/properties/count/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err18];
                    } else {
                      vErrors.push(err18);
                    }
                    errors++;
                  }
                  if (typeof data6 == "number" && isFinite(data6)) {
                    if (data6 > 9007199254740991 || isNaN(data6)) {
                      const err19 = { instancePath: instancePath + "/eventTypes/" + i0 + "/count", schemaPath: "#/definitions/BrowserTrajectoryEventTypeCount/properties/count/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                      if (vErrors === null) {
                        vErrors = [err19];
                      } else {
                        vErrors.push(err19);
                      }
                      errors++;
                    }
                    if (data6 < 0 || isNaN(data6)) {
                      const err20 = { instancePath: instancePath + "/eventTypes/" + i0 + "/count", schemaPath: "#/definitions/BrowserTrajectoryEventTypeCount/properties/count/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                      if (vErrors === null) {
                        vErrors = [err20];
                      } else {
                        vErrors.push(err20);
                      }
                      errors++;
                    }
                  }
                }
              } else {
                const err21 = { instancePath: instancePath + "/eventTypes/" + i0, schemaPath: "#/definitions/BrowserTrajectoryEventTypeCount/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err21];
                } else {
                  vErrors.push(err21);
                }
                errors++;
              }
            }
          } else {
            const err22 = { instancePath: instancePath + "/eventTypes", schemaPath: "#/properties/eventTypes/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err22];
            } else {
              vErrors.push(err22);
            }
            errors++;
          }
        }
      } else {
        const err23 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err23];
        } else {
          vErrors.push(err23);
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
        if (data.goalId === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.runId === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.committedThroughSequence === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "committedThroughSequence" }, message: "must have required property 'committedThroughSequence'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.eventCount === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "eventCount" }, message: "must have required property 'eventCount'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.timeRange === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "timeRange" }, message: "must have required property 'timeRange'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data.buckets === void 0) {
          const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "buckets" }, message: "must have required property 'buckets'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "goalId" || key0 === "runId" || key0 === "committedThroughSequence" || key0 === "eventCount" || key0 === "timeRange" || key0 === "buckets")) {
            const err6 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.goalId !== void 0) {
          let data0 = data.goalId;
          if (typeof data0 === "string") {
            if (!pattern0.test(data0)) {
              const err7 = { instancePath: instancePath + "/goalId", schemaPath: "#/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
          } else {
            const err8 = { instancePath: instancePath + "/goalId", schemaPath: "#/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.runId !== void 0) {
          let data1 = data.runId;
          if (typeof data1 === "string") {
            if (!pattern0.test(data1)) {
              const err9 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
          } else {
            const err10 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data.committedThroughSequence !== void 0) {
          let data2 = data.committedThroughSequence;
          if (!(typeof data2 == "number" && (!(data2 % 1) && !isNaN(data2)) && isFinite(data2))) {
            const err11 = { instancePath: instancePath + "/committedThroughSequence", schemaPath: "#/properties/committedThroughSequence/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
          if (typeof data2 == "number" && isFinite(data2)) {
            if (data2 > 9007199254740991 || isNaN(data2)) {
              const err12 = { instancePath: instancePath + "/committedThroughSequence", schemaPath: "#/properties/committedThroughSequence/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
            if (data2 < 0 || isNaN(data2)) {
              const err13 = { instancePath: instancePath + "/committedThroughSequence", schemaPath: "#/properties/committedThroughSequence/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
          }
        }
        if (data.eventCount !== void 0) {
          let data3 = data.eventCount;
          if (!(typeof data3 == "number" && (!(data3 % 1) && !isNaN(data3)) && isFinite(data3))) {
            const err14 = { instancePath: instancePath + "/eventCount", schemaPath: "#/properties/eventCount/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
          if (typeof data3 == "number" && isFinite(data3)) {
            if (data3 > 9007199254740991 || isNaN(data3)) {
              const err15 = { instancePath: instancePath + "/eventCount", schemaPath: "#/properties/eventCount/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
            if (data3 < 0 || isNaN(data3)) {
              const err16 = { instancePath: instancePath + "/eventCount", schemaPath: "#/properties/eventCount/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err16];
              } else {
                vErrors.push(err16);
              }
              errors++;
            }
          }
        }
        if (data.timeRange !== void 0) {
          let data4 = data.timeRange;
          const _errs11 = errors;
          let valid1 = false;
          const _errs12 = errors;
          if (data4 && typeof data4 == "object" && !Array.isArray(data4)) {
            if (data4.start === void 0) {
              const err17 = { instancePath: instancePath + "/timeRange", schemaPath: "#/definitions/BrowserTrajectoryTimeRange/required", keyword: "required", params: { missingProperty: "start" }, message: "must have required property 'start'" };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
            if (data4.end === void 0) {
              const err18 = { instancePath: instancePath + "/timeRange", schemaPath: "#/definitions/BrowserTrajectoryTimeRange/required", keyword: "required", params: { missingProperty: "end" }, message: "must have required property 'end'" };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
            for (const key1 in data4) {
              if (!(key1 === "start" || key1 === "end")) {
                const err19 = { instancePath: instancePath + "/timeRange", schemaPath: "#/definitions/BrowserTrajectoryTimeRange/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err19];
                } else {
                  vErrors.push(err19);
                }
                errors++;
              }
            }
            if (data4.start !== void 0) {
              if (typeof data4.start !== "string") {
                const err20 = { instancePath: instancePath + "/timeRange/start", schemaPath: "#/definitions/BrowserTrajectoryTimeRange/properties/start/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err20];
                } else {
                  vErrors.push(err20);
                }
                errors++;
              }
            }
            if (data4.end !== void 0) {
              if (typeof data4.end !== "string") {
                const err21 = { instancePath: instancePath + "/timeRange/end", schemaPath: "#/definitions/BrowserTrajectoryTimeRange/properties/end/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err21];
                } else {
                  vErrors.push(err21);
                }
                errors++;
              }
            }
          } else {
            const err22 = { instancePath: instancePath + "/timeRange", schemaPath: "#/definitions/BrowserTrajectoryTimeRange/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err22];
            } else {
              vErrors.push(err22);
            }
            errors++;
          }
          var _valid0 = _errs12 === errors;
          valid1 = valid1 || _valid0;
          if (!valid1) {
            const _errs20 = errors;
            if (data4 !== null) {
              const err23 = { instancePath: instancePath + "/timeRange", schemaPath: "#/properties/timeRange/anyOf/1/type", keyword: "type", params: { type: "null" }, message: "must be null" };
              if (vErrors === null) {
                vErrors = [err23];
              } else {
                vErrors.push(err23);
              }
              errors++;
            }
            var _valid0 = _errs20 === errors;
            valid1 = valid1 || _valid0;
          }
          if (!valid1) {
            const err24 = { instancePath: instancePath + "/timeRange", schemaPath: "#/properties/timeRange/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
            if (vErrors === null) {
              vErrors = [err24];
            } else {
              vErrors.push(err24);
            }
            errors++;
          } else {
            errors = _errs11;
            if (vErrors !== null) {
              if (_errs11) {
                vErrors.length = _errs11;
              } else {
                vErrors = null;
              }
            }
          }
        }
        if (data.buckets !== void 0) {
          let data7 = data.buckets;
          if (Array.isArray(data7)) {
            const len0 = data7.length;
            for (let i0 = 0; i0 < len0; i0++) {
              if (!validate12(data7[i0], { instancePath: instancePath + "/buckets/" + i0, parentData: data7, parentDataProperty: i0, rootData })) {
                vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                errors = vErrors.length;
              }
            }
          } else {
            const err25 = { instancePath: instancePath + "/buckets", schemaPath: "#/properties/buckets/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err25];
            } else {
              vErrors.push(err25);
            }
            errors++;
          }
        }
      } else {
        const err26 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err26];
        } else {
          vErrors.push(err26);
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
export default require_BrowserTrajectoryTimeline_validator();
