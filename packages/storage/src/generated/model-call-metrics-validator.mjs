var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// ModelCallMetricFileRecord-validator.cjs
var require_ModelCallMetricFileRecord_validator = __commonJS({
  "ModelCallMetricFileRecord-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema12 = { "anyOf": [{ "type": "object", "properties": { "recordType": { "type": "string", "const": "call_started" }, "goalId": { "type": "string" }, "runId": { "type": "string" }, "executionUnitId": { "type": "string" }, "callId": { "type": "string" }, "occurredAt": { "type": "string" }, "modelId": { "type": "string" } }, "required": ["recordType", "goalId", "runId", "callId", "occurredAt"], "additionalProperties": false }, { "type": "object", "properties": { "recordType": { "type": "string", "const": "call_finished" }, "goalId": { "type": "string" }, "runId": { "type": "string" }, "executionUnitId": { "type": "string" }, "callId": { "type": "string" }, "occurredAt": { "type": "string" }, "outcome": { "type": "string", "enum": ["completed", "failed", "cancelled"] }, "usage": { "$ref": "#/definitions/ModelCallMetricUsageFile" }, "requestDurationMs": { "type": "number" }, "decodeDurationMs": { "type": "number" } }, "required": ["recordType", "goalId", "runId", "callId", "occurredAt", "outcome", "usage"], "additionalProperties": false }], "description": "\u6A21\u578B\u8C03\u7528\u6307\u6807 JSONL \u7684\u6587\u4EF6\u8BB0\u5F55\u3002" };
    var func2 = Object.prototype.hasOwnProperty;
    function validate11(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      const _errs0 = errors;
      let valid0 = false;
      const _errs1 = errors;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.recordType === void 0) {
          const err0 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "recordType" }, message: "must have required property 'recordType'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.goalId === void 0) {
          const err1 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.runId === void 0) {
          const err2 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.callId === void 0) {
          const err3 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "callId" }, message: "must have required property 'callId'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.occurredAt === void 0) {
          const err4 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "occurredAt" }, message: "must have required property 'occurredAt'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "recordType" || key0 === "goalId" || key0 === "runId" || key0 === "executionUnitId" || key0 === "callId" || key0 === "occurredAt" || key0 === "modelId")) {
            const err5 = { instancePath, schemaPath: "#/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.recordType !== void 0) {
          let data0 = data.recordType;
          if (typeof data0 !== "string") {
            const err6 = { instancePath: instancePath + "/recordType", schemaPath: "#/anyOf/0/properties/recordType/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
          if ("call_started" !== data0) {
            const err7 = { instancePath: instancePath + "/recordType", schemaPath: "#/anyOf/0/properties/recordType/const", keyword: "const", params: { allowedValue: "call_started" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.goalId !== void 0) {
          if (typeof data.goalId !== "string") {
            const err8 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/0/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.runId !== void 0) {
          if (typeof data.runId !== "string") {
            const err9 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/0/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data.executionUnitId !== void 0) {
          if (typeof data.executionUnitId !== "string") {
            const err10 = { instancePath: instancePath + "/executionUnitId", schemaPath: "#/anyOf/0/properties/executionUnitId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data.callId !== void 0) {
          if (typeof data.callId !== "string") {
            const err11 = { instancePath: instancePath + "/callId", schemaPath: "#/anyOf/0/properties/callId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
        }
        if (data.occurredAt !== void 0) {
          if (typeof data.occurredAt !== "string") {
            const err12 = { instancePath: instancePath + "/occurredAt", schemaPath: "#/anyOf/0/properties/occurredAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data.modelId !== void 0) {
          if (typeof data.modelId !== "string") {
            const err13 = { instancePath: instancePath + "/modelId", schemaPath: "#/anyOf/0/properties/modelId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        }
      } else {
        const err14 = { instancePath, schemaPath: "#/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
      var _valid0 = _errs1 === errors;
      valid0 = valid0 || _valid0;
      if (!valid0) {
        const _errs18 = errors;
        if (data && typeof data == "object" && !Array.isArray(data)) {
          if (data.recordType === void 0) {
            const err15 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "recordType" }, message: "must have required property 'recordType'" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
          if (data.goalId === void 0) {
            const err16 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
          if (data.runId === void 0) {
            const err17 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
          if (data.callId === void 0) {
            const err18 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "callId" }, message: "must have required property 'callId'" };
            if (vErrors === null) {
              vErrors = [err18];
            } else {
              vErrors.push(err18);
            }
            errors++;
          }
          if (data.occurredAt === void 0) {
            const err19 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "occurredAt" }, message: "must have required property 'occurredAt'" };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          }
          if (data.outcome === void 0) {
            const err20 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "outcome" }, message: "must have required property 'outcome'" };
            if (vErrors === null) {
              vErrors = [err20];
            } else {
              vErrors.push(err20);
            }
            errors++;
          }
          if (data.usage === void 0) {
            const err21 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "usage" }, message: "must have required property 'usage'" };
            if (vErrors === null) {
              vErrors = [err21];
            } else {
              vErrors.push(err21);
            }
            errors++;
          }
          for (const key1 in data) {
            if (!func2.call(schema12.anyOf[1].properties, key1)) {
              const err22 = { instancePath, schemaPath: "#/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err22];
              } else {
                vErrors.push(err22);
              }
              errors++;
            }
          }
          if (data.recordType !== void 0) {
            let data7 = data.recordType;
            if (typeof data7 !== "string") {
              const err23 = { instancePath: instancePath + "/recordType", schemaPath: "#/anyOf/1/properties/recordType/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err23];
              } else {
                vErrors.push(err23);
              }
              errors++;
            }
            if ("call_finished" !== data7) {
              const err24 = { instancePath: instancePath + "/recordType", schemaPath: "#/anyOf/1/properties/recordType/const", keyword: "const", params: { allowedValue: "call_finished" }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err24];
              } else {
                vErrors.push(err24);
              }
              errors++;
            }
          }
          if (data.goalId !== void 0) {
            if (typeof data.goalId !== "string") {
              const err25 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/1/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err25];
              } else {
                vErrors.push(err25);
              }
              errors++;
            }
          }
          if (data.runId !== void 0) {
            if (typeof data.runId !== "string") {
              const err26 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/1/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err26];
              } else {
                vErrors.push(err26);
              }
              errors++;
            }
          }
          if (data.executionUnitId !== void 0) {
            if (typeof data.executionUnitId !== "string") {
              const err27 = { instancePath: instancePath + "/executionUnitId", schemaPath: "#/anyOf/1/properties/executionUnitId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err27];
              } else {
                vErrors.push(err27);
              }
              errors++;
            }
          }
          if (data.callId !== void 0) {
            if (typeof data.callId !== "string") {
              const err28 = { instancePath: instancePath + "/callId", schemaPath: "#/anyOf/1/properties/callId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err28];
              } else {
                vErrors.push(err28);
              }
              errors++;
            }
          }
          if (data.occurredAt !== void 0) {
            if (typeof data.occurredAt !== "string") {
              const err29 = { instancePath: instancePath + "/occurredAt", schemaPath: "#/anyOf/1/properties/occurredAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err29];
              } else {
                vErrors.push(err29);
              }
              errors++;
            }
          }
          if (data.outcome !== void 0) {
            let data13 = data.outcome;
            if (typeof data13 !== "string") {
              const err30 = { instancePath: instancePath + "/outcome", schemaPath: "#/anyOf/1/properties/outcome/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err30];
              } else {
                vErrors.push(err30);
              }
              errors++;
            }
            if (!(data13 === "completed" || data13 === "failed" || data13 === "cancelled")) {
              const err31 = { instancePath: instancePath + "/outcome", schemaPath: "#/anyOf/1/properties/outcome/enum", keyword: "enum", params: { allowedValues: schema12.anyOf[1].properties.outcome.enum }, message: "must be equal to one of the allowed values" };
              if (vErrors === null) {
                vErrors = [err31];
              } else {
                vErrors.push(err31);
              }
              errors++;
            }
          }
          if (data.usage !== void 0) {
            let data14 = data.usage;
            const _errs37 = errors;
            let valid4 = false;
            const _errs38 = errors;
            if (data14 && typeof data14 == "object" && !Array.isArray(data14)) {
              if (data14.source === void 0) {
                const err32 = { instancePath: instancePath + "/usage", schemaPath: "#/definitions/ModelCallMetricUsageFile/anyOf/0/required", keyword: "required", params: { missingProperty: "source" }, message: "must have required property 'source'" };
                if (vErrors === null) {
                  vErrors = [err32];
                } else {
                  vErrors.push(err32);
                }
                errors++;
              }
              if (data14.inputTokens === void 0) {
                const err33 = { instancePath: instancePath + "/usage", schemaPath: "#/definitions/ModelCallMetricUsageFile/anyOf/0/required", keyword: "required", params: { missingProperty: "inputTokens" }, message: "must have required property 'inputTokens'" };
                if (vErrors === null) {
                  vErrors = [err33];
                } else {
                  vErrors.push(err33);
                }
                errors++;
              }
              if (data14.outputTokens === void 0) {
                const err34 = { instancePath: instancePath + "/usage", schemaPath: "#/definitions/ModelCallMetricUsageFile/anyOf/0/required", keyword: "required", params: { missingProperty: "outputTokens" }, message: "must have required property 'outputTokens'" };
                if (vErrors === null) {
                  vErrors = [err34];
                } else {
                  vErrors.push(err34);
                }
                errors++;
              }
              for (const key2 in data14) {
                if (!(key2 === "source" || key2 === "inputTokens" || key2 === "outputTokens" || key2 === "cachedInputTokens")) {
                  const err35 = { instancePath: instancePath + "/usage", schemaPath: "#/definitions/ModelCallMetricUsageFile/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                  if (vErrors === null) {
                    vErrors = [err35];
                  } else {
                    vErrors.push(err35);
                  }
                  errors++;
                }
              }
              if (data14.source !== void 0) {
                let data15 = data14.source;
                if (typeof data15 !== "string") {
                  const err36 = { instancePath: instancePath + "/usage/source", schemaPath: "#/definitions/ModelCallMetricUsageFile/anyOf/0/properties/source/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err36];
                  } else {
                    vErrors.push(err36);
                  }
                  errors++;
                }
                if ("provider_reported" !== data15) {
                  const err37 = { instancePath: instancePath + "/usage/source", schemaPath: "#/definitions/ModelCallMetricUsageFile/anyOf/0/properties/source/const", keyword: "const", params: { allowedValue: "provider_reported" }, message: "must be equal to constant" };
                  if (vErrors === null) {
                    vErrors = [err37];
                  } else {
                    vErrors.push(err37);
                  }
                  errors++;
                }
              }
              if (data14.inputTokens !== void 0) {
                let data16 = data14.inputTokens;
                if (!(typeof data16 == "number" && isFinite(data16))) {
                  const err38 = { instancePath: instancePath + "/usage/inputTokens", schemaPath: "#/definitions/ModelCallMetricUsageFile/anyOf/0/properties/inputTokens/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                  if (vErrors === null) {
                    vErrors = [err38];
                  } else {
                    vErrors.push(err38);
                  }
                  errors++;
                }
              }
              if (data14.outputTokens !== void 0) {
                let data17 = data14.outputTokens;
                if (!(typeof data17 == "number" && isFinite(data17))) {
                  const err39 = { instancePath: instancePath + "/usage/outputTokens", schemaPath: "#/definitions/ModelCallMetricUsageFile/anyOf/0/properties/outputTokens/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                  if (vErrors === null) {
                    vErrors = [err39];
                  } else {
                    vErrors.push(err39);
                  }
                  errors++;
                }
              }
              if (data14.cachedInputTokens !== void 0) {
                let data18 = data14.cachedInputTokens;
                if (!(typeof data18 == "number" && isFinite(data18))) {
                  const err40 = { instancePath: instancePath + "/usage/cachedInputTokens", schemaPath: "#/definitions/ModelCallMetricUsageFile/anyOf/0/properties/cachedInputTokens/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                  if (vErrors === null) {
                    vErrors = [err40];
                  } else {
                    vErrors.push(err40);
                  }
                  errors++;
                }
              }
            } else {
              const err41 = { instancePath: instancePath + "/usage", schemaPath: "#/definitions/ModelCallMetricUsageFile/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
              if (vErrors === null) {
                vErrors = [err41];
              } else {
                vErrors.push(err41);
              }
              errors++;
            }
            var _valid1 = _errs38 === errors;
            valid4 = valid4 || _valid1;
            if (!valid4) {
              const _errs49 = errors;
              if (data14 && typeof data14 == "object" && !Array.isArray(data14)) {
                if (data14.source === void 0) {
                  const err42 = { instancePath: instancePath + "/usage", schemaPath: "#/definitions/ModelCallMetricUsageFile/anyOf/1/required", keyword: "required", params: { missingProperty: "source" }, message: "must have required property 'source'" };
                  if (vErrors === null) {
                    vErrors = [err42];
                  } else {
                    vErrors.push(err42);
                  }
                  errors++;
                }
                for (const key3 in data14) {
                  if (!(key3 === "source")) {
                    const err43 = { instancePath: instancePath + "/usage", schemaPath: "#/definitions/ModelCallMetricUsageFile/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err43];
                    } else {
                      vErrors.push(err43);
                    }
                    errors++;
                  }
                }
                if (data14.source !== void 0) {
                  let data19 = data14.source;
                  if (typeof data19 !== "string") {
                    const err44 = { instancePath: instancePath + "/usage/source", schemaPath: "#/definitions/ModelCallMetricUsageFile/anyOf/1/properties/source/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err44];
                    } else {
                      vErrors.push(err44);
                    }
                    errors++;
                  }
                  if ("unavailable" !== data19) {
                    const err45 = { instancePath: instancePath + "/usage/source", schemaPath: "#/definitions/ModelCallMetricUsageFile/anyOf/1/properties/source/const", keyword: "const", params: { allowedValue: "unavailable" }, message: "must be equal to constant" };
                    if (vErrors === null) {
                      vErrors = [err45];
                    } else {
                      vErrors.push(err45);
                    }
                    errors++;
                  }
                }
              } else {
                const err46 = { instancePath: instancePath + "/usage", schemaPath: "#/definitions/ModelCallMetricUsageFile/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err46];
                } else {
                  vErrors.push(err46);
                }
                errors++;
              }
              var _valid1 = _errs49 === errors;
              valid4 = valid4 || _valid1;
            }
            if (!valid4) {
              const err47 = { instancePath: instancePath + "/usage", schemaPath: "#/definitions/ModelCallMetricUsageFile/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
              if (vErrors === null) {
                vErrors = [err47];
              } else {
                vErrors.push(err47);
              }
              errors++;
            } else {
              errors = _errs37;
              if (vErrors !== null) {
                if (_errs37) {
                  vErrors.length = _errs37;
                } else {
                  vErrors = null;
                }
              }
            }
          }
          if (data.requestDurationMs !== void 0) {
            let data20 = data.requestDurationMs;
            if (!(typeof data20 == "number" && isFinite(data20))) {
              const err48 = { instancePath: instancePath + "/requestDurationMs", schemaPath: "#/anyOf/1/properties/requestDurationMs/type", keyword: "type", params: { type: "number" }, message: "must be number" };
              if (vErrors === null) {
                vErrors = [err48];
              } else {
                vErrors.push(err48);
              }
              errors++;
            }
          }
          if (data.decodeDurationMs !== void 0) {
            let data21 = data.decodeDurationMs;
            if (!(typeof data21 == "number" && isFinite(data21))) {
              const err49 = { instancePath: instancePath + "/decodeDurationMs", schemaPath: "#/anyOf/1/properties/decodeDurationMs/type", keyword: "type", params: { type: "number" }, message: "must be number" };
              if (vErrors === null) {
                vErrors = [err49];
              } else {
                vErrors.push(err49);
              }
              errors++;
            }
          }
        } else {
          const err50 = { instancePath, schemaPath: "#/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
          if (vErrors === null) {
            vErrors = [err50];
          } else {
            vErrors.push(err50);
          }
          errors++;
        }
        var _valid0 = _errs18 === errors;
        valid0 = valid0 || _valid0;
      }
      if (!valid0) {
        const err51 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err51];
        } else {
          vErrors.push(err51);
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
export default require_ModelCallMetricFileRecord_validator();
