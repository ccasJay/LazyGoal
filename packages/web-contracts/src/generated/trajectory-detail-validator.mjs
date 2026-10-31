var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// BrowserTrajectoryDetail-validator.cjs
var require_BrowserTrajectoryDetail_validator = __commonJS({
  "BrowserTrajectoryDetail-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema12 = { "type": "object", "properties": { "event": { "$ref": "#/definitions/BrowserTrajectoryEventWire" }, "input": {}, "result": { "$ref": "#/definitions/BrowserTrajectoryObservationWire" }, "toolFinished": { "$ref": "#/definitions/BrowserTrajectoryToolFinished" }, "toolStartedAt": { "type": "string" }, "toolFinishedAt": { "type": "string" }, "toolDurationMs": { "type": ["number", "null"] }, "observationConfirmed": { "type": "boolean" } }, "required": ["event", "toolDurationMs", "observationConfirmed"], "additionalProperties": false, "description": "\u5B8C\u6574\u8F68\u8FF9\u4E8B\u4EF6\u4E0E\u5173\u8054\u4E0A\u4E0B\u6587\u8BE6\u60C5\u3002" };
    var schema13 = { "type": "object", "properties": { "eventId": { "type": "string", "pattern": "\\S" }, "goalId": { "type": "string", "pattern": "\\S" }, "runId": { "type": "string", "pattern": "\\S" }, "sequence": { "type": "integer", "maximum": 9007199254740991, "minimum": 1 }, "occurredAt": { "type": "string" }, "phase": { "type": "string" }, "eventType": { "type": "string" }, "executionUnitId": { "type": "string", "pattern": "\\S" }, "stepIndex": { "type": "integer", "maximum": 9007199254740991 }, "actionId": { "type": "string", "pattern": "\\S" }, "programId": { "type": "string", "pattern": "\\S" }, "callIndex": { "type": "integer", "maximum": 9007199254740991 }, "parentActionId": { "type": "string", "pattern": "\\S" }, "payload": { "$ref": "#/definitions/BrowserTrajectoryEventPayloadWire" }, "eventSchemaVersion": { "type": "integer", "maximum": 9007199254740991 } }, "required": ["eventId", "goalId", "runId", "sequence", "occurredAt", "phase", "eventType", "payload"], "additionalProperties": false, "description": "\u8F68\u8FF9\u4E8B\u4EF6\u7684 wire \u4F20\u8F93\u4FE1\u5C01\u3002" };
    var func2 = Object.prototype.hasOwnProperty;
    var pattern0 = new RegExp("\\S", "u");
    var wrapper0 = { validate: validate14 };
    function validate14(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      const _errs0 = errors;
      let valid0 = false;
      const _errs1 = errors;
      if (data !== null) {
        const err0 = { instancePath, schemaPath: "#/anyOf/0/type", keyword: "type", params: { type: "null" }, message: "must be null" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      var _valid0 = _errs1 === errors;
      valid0 = valid0 || _valid0;
      if (!valid0) {
        const _errs3 = errors;
        if (typeof data !== "boolean") {
          const err1 = { instancePath, schemaPath: "#/anyOf/1/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        var _valid0 = _errs3 === errors;
        valid0 = valid0 || _valid0;
        if (!valid0) {
          const _errs5 = errors;
          if (!(typeof data == "number" && isFinite(data))) {
            const err2 = { instancePath, schemaPath: "#/anyOf/2/type", keyword: "type", params: { type: "number" }, message: "must be number" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
          var _valid0 = _errs5 === errors;
          valid0 = valid0 || _valid0;
          if (!valid0) {
            const _errs7 = errors;
            if (typeof data !== "string") {
              const err3 = { instancePath, schemaPath: "#/anyOf/3/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err3];
              } else {
                vErrors.push(err3);
              }
              errors++;
            }
            var _valid0 = _errs7 === errors;
            valid0 = valid0 || _valid0;
            if (!valid0) {
              const _errs9 = errors;
              if (Array.isArray(data)) {
                const len0 = data.length;
                for (let i0 = 0; i0 < len0; i0++) {
                  if (!wrapper0.validate(data[i0], { instancePath: instancePath + "/" + i0, parentData: data, parentDataProperty: i0, rootData })) {
                    vErrors = vErrors === null ? wrapper0.validate.errors : vErrors.concat(wrapper0.validate.errors);
                    errors = vErrors.length;
                  }
                }
              } else {
                const err4 = { instancePath, schemaPath: "#/anyOf/4/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err4];
                } else {
                  vErrors.push(err4);
                }
                errors++;
              }
              var _valid0 = _errs9 === errors;
              valid0 = valid0 || _valid0;
              if (!valid0) {
                const _errs12 = errors;
                if (data && typeof data == "object" && !Array.isArray(data)) {
                  for (const key0 in data) {
                    if (!wrapper0.validate(data[key0], { instancePath: instancePath + "/" + key0.replace(/~/g, "~0").replace(/\//g, "~1"), parentData: data, parentDataProperty: key0, rootData })) {
                      vErrors = vErrors === null ? wrapper0.validate.errors : vErrors.concat(wrapper0.validate.errors);
                      errors = vErrors.length;
                    }
                  }
                } else {
                  const err5 = { instancePath, schemaPath: "#/anyOf/5/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                  if (vErrors === null) {
                    vErrors = [err5];
                  } else {
                    vErrors.push(err5);
                  }
                  errors++;
                }
                var _valid0 = _errs12 === errors;
                valid0 = valid0 || _valid0;
              }
            }
          }
        }
      }
      if (!valid0) {
        const err6 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      } else {
        errors = _errs0;
        if (vErrors !== null) {
          if (_errs0) {
            vErrors.length = _errs0;
          } else {
            vErrors = null;
          }
        }
      }
      validate14.errors = vErrors;
      return errors === 0;
    }
    function validate13(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.type === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "type")) {
            if (!validate14(data[key0], { instancePath: instancePath + "/" + key0.replace(/~/g, "~0").replace(/\//g, "~1"), parentData: data, parentDataProperty: key0, rootData })) {
              vErrors = vErrors === null ? validate14.errors : vErrors.concat(validate14.errors);
              errors = vErrors.length;
            }
          }
        }
        if (data.type !== void 0) {
          if (typeof data.type !== "string") {
            const err1 = { instancePath: instancePath + "/type", schemaPath: "#/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
        }
      } else {
        const err2 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
      validate13.errors = vErrors;
      return errors === 0;
    }
    function validate12(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.eventId === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "eventId" }, message: "must have required property 'eventId'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.goalId === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.runId === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.sequence === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "sequence" }, message: "must have required property 'sequence'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.occurredAt === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "occurredAt" }, message: "must have required property 'occurredAt'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data.phase === void 0) {
          const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "phase" }, message: "must have required property 'phase'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        if (data.eventType === void 0) {
          const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "eventType" }, message: "must have required property 'eventType'" };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        if (data.payload === void 0) {
          const err7 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "payload" }, message: "must have required property 'payload'" };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!func2.call(schema13.properties, key0)) {
            const err8 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.eventId !== void 0) {
          let data0 = data.eventId;
          if (typeof data0 === "string") {
            if (!pattern0.test(data0)) {
              const err9 = { instancePath: instancePath + "/eventId", schemaPath: "#/properties/eventId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
          } else {
            const err10 = { instancePath: instancePath + "/eventId", schemaPath: "#/properties/eventId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data.goalId !== void 0) {
          let data1 = data.goalId;
          if (typeof data1 === "string") {
            if (!pattern0.test(data1)) {
              const err11 = { instancePath: instancePath + "/goalId", schemaPath: "#/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
          } else {
            const err12 = { instancePath: instancePath + "/goalId", schemaPath: "#/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data.runId !== void 0) {
          let data2 = data.runId;
          if (typeof data2 === "string") {
            if (!pattern0.test(data2)) {
              const err13 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
          } else {
            const err14 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
        }
        if (data.sequence !== void 0) {
          let data3 = data.sequence;
          if (!(typeof data3 == "number" && (!(data3 % 1) && !isNaN(data3)) && isFinite(data3))) {
            const err15 = { instancePath: instancePath + "/sequence", schemaPath: "#/properties/sequence/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
          if (typeof data3 == "number" && isFinite(data3)) {
            if (data3 > 9007199254740991 || isNaN(data3)) {
              const err16 = { instancePath: instancePath + "/sequence", schemaPath: "#/properties/sequence/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err16];
              } else {
                vErrors.push(err16);
              }
              errors++;
            }
            if (data3 < 1 || isNaN(data3)) {
              const err17 = { instancePath: instancePath + "/sequence", schemaPath: "#/properties/sequence/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
          }
        }
        if (data.occurredAt !== void 0) {
          if (typeof data.occurredAt !== "string") {
            const err18 = { instancePath: instancePath + "/occurredAt", schemaPath: "#/properties/occurredAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err18];
            } else {
              vErrors.push(err18);
            }
            errors++;
          }
        }
        if (data.phase !== void 0) {
          if (typeof data.phase !== "string") {
            const err19 = { instancePath: instancePath + "/phase", schemaPath: "#/properties/phase/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          }
        }
        if (data.eventType !== void 0) {
          if (typeof data.eventType !== "string") {
            const err20 = { instancePath: instancePath + "/eventType", schemaPath: "#/properties/eventType/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err20];
            } else {
              vErrors.push(err20);
            }
            errors++;
          }
        }
        if (data.executionUnitId !== void 0) {
          let data7 = data.executionUnitId;
          if (typeof data7 === "string") {
            if (!pattern0.test(data7)) {
              const err21 = { instancePath: instancePath + "/executionUnitId", schemaPath: "#/properties/executionUnitId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            }
          } else {
            const err22 = { instancePath: instancePath + "/executionUnitId", schemaPath: "#/properties/executionUnitId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err22];
            } else {
              vErrors.push(err22);
            }
            errors++;
          }
        }
        if (data.stepIndex !== void 0) {
          let data8 = data.stepIndex;
          if (!(typeof data8 == "number" && (!(data8 % 1) && !isNaN(data8)) && isFinite(data8))) {
            const err23 = { instancePath: instancePath + "/stepIndex", schemaPath: "#/properties/stepIndex/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err23];
            } else {
              vErrors.push(err23);
            }
            errors++;
          }
          if (typeof data8 == "number" && isFinite(data8)) {
            if (data8 > 9007199254740991 || isNaN(data8)) {
              const err24 = { instancePath: instancePath + "/stepIndex", schemaPath: "#/properties/stepIndex/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err24];
              } else {
                vErrors.push(err24);
              }
              errors++;
            }
          }
        }
        if (data.actionId !== void 0) {
          let data9 = data.actionId;
          if (typeof data9 === "string") {
            if (!pattern0.test(data9)) {
              const err25 = { instancePath: instancePath + "/actionId", schemaPath: "#/properties/actionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err25];
              } else {
                vErrors.push(err25);
              }
              errors++;
            }
          } else {
            const err26 = { instancePath: instancePath + "/actionId", schemaPath: "#/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err26];
            } else {
              vErrors.push(err26);
            }
            errors++;
          }
        }
        if (data.programId !== void 0) {
          let data10 = data.programId;
          if (typeof data10 === "string") {
            if (!pattern0.test(data10)) {
              const err27 = { instancePath: instancePath + "/programId", schemaPath: "#/properties/programId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err27];
              } else {
                vErrors.push(err27);
              }
              errors++;
            }
          } else {
            const err28 = { instancePath: instancePath + "/programId", schemaPath: "#/properties/programId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err28];
            } else {
              vErrors.push(err28);
            }
            errors++;
          }
        }
        if (data.callIndex !== void 0) {
          let data11 = data.callIndex;
          if (!(typeof data11 == "number" && (!(data11 % 1) && !isNaN(data11)) && isFinite(data11))) {
            const err29 = { instancePath: instancePath + "/callIndex", schemaPath: "#/properties/callIndex/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err29];
            } else {
              vErrors.push(err29);
            }
            errors++;
          }
          if (typeof data11 == "number" && isFinite(data11)) {
            if (data11 > 9007199254740991 || isNaN(data11)) {
              const err30 = { instancePath: instancePath + "/callIndex", schemaPath: "#/properties/callIndex/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err30];
              } else {
                vErrors.push(err30);
              }
              errors++;
            }
          }
        }
        if (data.parentActionId !== void 0) {
          let data12 = data.parentActionId;
          if (typeof data12 === "string") {
            if (!pattern0.test(data12)) {
              const err31 = { instancePath: instancePath + "/parentActionId", schemaPath: "#/properties/parentActionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err31];
              } else {
                vErrors.push(err31);
              }
              errors++;
            }
          } else {
            const err32 = { instancePath: instancePath + "/parentActionId", schemaPath: "#/properties/parentActionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err32];
            } else {
              vErrors.push(err32);
            }
            errors++;
          }
        }
        if (data.payload !== void 0) {
          if (!validate13(data.payload, { instancePath: instancePath + "/payload", parentData: data, parentDataProperty: "payload", rootData })) {
            vErrors = vErrors === null ? validate13.errors : vErrors.concat(validate13.errors);
            errors = vErrors.length;
          }
        }
        if (data.eventSchemaVersion !== void 0) {
          let data14 = data.eventSchemaVersion;
          if (!(typeof data14 == "number" && (!(data14 % 1) && !isNaN(data14)) && isFinite(data14))) {
            const err33 = { instancePath: instancePath + "/eventSchemaVersion", schemaPath: "#/properties/eventSchemaVersion/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err33];
            } else {
              vErrors.push(err33);
            }
            errors++;
          }
          if (typeof data14 == "number" && isFinite(data14)) {
            if (data14 > 9007199254740991 || isNaN(data14)) {
              const err34 = { instancePath: instancePath + "/eventSchemaVersion", schemaPath: "#/properties/eventSchemaVersion/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err34];
              } else {
                vErrors.push(err34);
              }
              errors++;
            }
          }
        }
      } else {
        const err35 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err35];
        } else {
          vErrors.push(err35);
        }
        errors++;
      }
      validate12.errors = vErrors;
      return errors === 0;
    }
    function validate18(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        for (const key0 in data) {
          if (!validate14(data[key0], { instancePath: instancePath + "/" + key0.replace(/~/g, "~0").replace(/\//g, "~1"), parentData: data, parentDataProperty: key0, rootData })) {
            vErrors = vErrors === null ? validate14.errors : vErrors.concat(validate14.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err0 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      validate18.errors = vErrors;
      return errors === 0;
    }
    function validate11(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.event === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "event" }, message: "must have required property 'event'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.toolDurationMs === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "toolDurationMs" }, message: "must have required property 'toolDurationMs'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.observationConfirmed === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "observationConfirmed" }, message: "must have required property 'observationConfirmed'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "event" || key0 === "input" || key0 === "result" || key0 === "toolFinished" || key0 === "toolStartedAt" || key0 === "toolFinishedAt" || key0 === "toolDurationMs" || key0 === "observationConfirmed")) {
            const err3 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.event !== void 0) {
          if (!validate12(data.event, { instancePath: instancePath + "/event", parentData: data, parentDataProperty: "event", rootData })) {
            vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
            errors = vErrors.length;
          }
        }
        if (data.result !== void 0) {
          if (!validate18(data.result, { instancePath: instancePath + "/result", parentData: data, parentDataProperty: "result", rootData })) {
            vErrors = vErrors === null ? validate18.errors : vErrors.concat(validate18.errors);
            errors = vErrors.length;
          }
        }
        if (data.toolFinished !== void 0) {
          let data2 = data.toolFinished;
          if (data2 && typeof data2 == "object" && !Array.isArray(data2)) {
            if (data2.eventType === void 0) {
              const err4 = { instancePath: instancePath + "/toolFinished", schemaPath: "#/definitions/BrowserTrajectoryToolFinished/required", keyword: "required", params: { missingProperty: "eventType" }, message: "must have required property 'eventType'" };
              if (vErrors === null) {
                vErrors = [err4];
              } else {
                vErrors.push(err4);
              }
              errors++;
            }
            if (data2.payload === void 0) {
              const err5 = { instancePath: instancePath + "/toolFinished", schemaPath: "#/definitions/BrowserTrajectoryToolFinished/required", keyword: "required", params: { missingProperty: "payload" }, message: "must have required property 'payload'" };
              if (vErrors === null) {
                vErrors = [err5];
              } else {
                vErrors.push(err5);
              }
              errors++;
            }
            for (const key1 in data2) {
              if (!(key1 === "eventType" || key1 === "payload")) {
                const err6 = { instancePath: instancePath + "/toolFinished", schemaPath: "#/definitions/BrowserTrajectoryToolFinished/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err6];
                } else {
                  vErrors.push(err6);
                }
                errors++;
              }
            }
            if (data2.eventType !== void 0) {
              if (typeof data2.eventType !== "string") {
                const err7 = { instancePath: instancePath + "/toolFinished/eventType", schemaPath: "#/definitions/BrowserTrajectoryToolFinished/properties/eventType/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err7];
                } else {
                  vErrors.push(err7);
                }
                errors++;
              }
            }
            if (data2.payload !== void 0) {
              let data4 = data2.payload;
              if (data4 && typeof data4 == "object" && !Array.isArray(data4)) {
              } else {
                const err8 = { instancePath: instancePath + "/toolFinished/payload", schemaPath: "#/definitions/BrowserTrajectoryToolFinished/properties/payload/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err8];
                } else {
                  vErrors.push(err8);
                }
                errors++;
              }
            }
          } else {
            const err9 = { instancePath: instancePath + "/toolFinished", schemaPath: "#/definitions/BrowserTrajectoryToolFinished/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data.toolStartedAt !== void 0) {
          if (typeof data.toolStartedAt !== "string") {
            const err10 = { instancePath: instancePath + "/toolStartedAt", schemaPath: "#/properties/toolStartedAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data.toolFinishedAt !== void 0) {
          if (typeof data.toolFinishedAt !== "string") {
            const err11 = { instancePath: instancePath + "/toolFinishedAt", schemaPath: "#/properties/toolFinishedAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
        }
        if (data.toolDurationMs !== void 0) {
          let data7 = data.toolDurationMs;
          if (!(typeof data7 == "number" && isFinite(data7)) && data7 !== null) {
            const err12 = { instancePath: instancePath + "/toolDurationMs", schemaPath: "#/properties/toolDurationMs/type", keyword: "type", params: { type: schema12.properties.toolDurationMs.type }, message: "must be number,null" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data.observationConfirmed !== void 0) {
          if (typeof data.observationConfirmed !== "boolean") {
            const err13 = { instancePath: instancePath + "/observationConfirmed", schemaPath: "#/properties/observationConfirmed/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        }
      } else {
        const err14 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
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
export default require_BrowserTrajectoryDetail_validator();
