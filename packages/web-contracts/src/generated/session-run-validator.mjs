var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// BrowserSessionRun-validator.cjs
var require_BrowserSessionRun_validator = __commonJS({
  "BrowserSessionRun-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema13 = { "type": "string", "enum": ["created", "running", "waiting", "completed", "failed", "cancelled"], "description": "Run \u751F\u547D\u5468\u671F\u72B6\u6001\u3002" };
    var pattern0 = new RegExp("\\S", "u");
    var schema14 = { "type": "object", "properties": { "runId": { "type": "string", "pattern": "\\S" }, "executionUnitId": { "type": "string", "pattern": "\\S" }, "sourceEventId": { "type": "string", "pattern": "\\S" }, "actionId": { "type": "string", "pattern": "\\S" }, "activityBoundaryBefore": { "type": "boolean", "const": true }, "sequence": { "type": "integer", "maximum": 9007199254740991 }, "stepIndex": { "type": "integer", "maximum": 9007199254740991 }, "decisionKind": { "type": "string" }, "toolId": { "type": "string" }, "inputSummary": { "type": "string" }, "actionStatus": { "type": "string", "enum": ["awaiting_approval", "approved", "rejected"] }, "status": { "type": "string", "enum": ["recorded", "completed", "failed", "rejected"] }, "summary": { "type": "string" }, "think": { "$ref": "#/definitions/BrowserSessionStepThink" }, "bashExecution": { "$ref": "#/definitions/BrowserBashExecutionDetail" }, "bashExecutionOmitted": { "type": "boolean", "const": true }, "recoveryAttempts": { "type": "array", "items": { "type": "string" } }, "stageId": { "type": "string", "pattern": "\\S" } }, "required": ["runId", "executionUnitId", "sequence", "stepIndex", "status"], "additionalProperties": false, "description": "\u4F1A\u8BDD\u5355\u6B65\u6267\u884C\u7684\u5B89\u5168\u6295\u5F71\u3002" };
    var func2 = Object.prototype.hasOwnProperty;
    function validate12(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.runId === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.executionUnitId === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "executionUnitId" }, message: "must have required property 'executionUnitId'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.sequence === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "sequence" }, message: "must have required property 'sequence'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.stepIndex === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "stepIndex" }, message: "must have required property 'stepIndex'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.status === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!func2.call(schema14.properties, key0)) {
            const err5 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.runId !== void 0) {
          let data0 = data.runId;
          if (typeof data0 === "string") {
            if (!pattern0.test(data0)) {
              const err6 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err6];
              } else {
                vErrors.push(err6);
              }
              errors++;
            }
          } else {
            const err7 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.executionUnitId !== void 0) {
          let data1 = data.executionUnitId;
          if (typeof data1 === "string") {
            if (!pattern0.test(data1)) {
              const err8 = { instancePath: instancePath + "/executionUnitId", schemaPath: "#/properties/executionUnitId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err8];
              } else {
                vErrors.push(err8);
              }
              errors++;
            }
          } else {
            const err9 = { instancePath: instancePath + "/executionUnitId", schemaPath: "#/properties/executionUnitId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data.sourceEventId !== void 0) {
          let data2 = data.sourceEventId;
          if (typeof data2 === "string") {
            if (!pattern0.test(data2)) {
              const err10 = { instancePath: instancePath + "/sourceEventId", schemaPath: "#/properties/sourceEventId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
          } else {
            const err11 = { instancePath: instancePath + "/sourceEventId", schemaPath: "#/properties/sourceEventId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
        }
        if (data.actionId !== void 0) {
          let data3 = data.actionId;
          if (typeof data3 === "string") {
            if (!pattern0.test(data3)) {
              const err12 = { instancePath: instancePath + "/actionId", schemaPath: "#/properties/actionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
          } else {
            const err13 = { instancePath: instancePath + "/actionId", schemaPath: "#/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        }
        if (data.activityBoundaryBefore !== void 0) {
          let data4 = data.activityBoundaryBefore;
          if (typeof data4 !== "boolean") {
            const err14 = { instancePath: instancePath + "/activityBoundaryBefore", schemaPath: "#/properties/activityBoundaryBefore/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
          if (true !== data4) {
            const err15 = { instancePath: instancePath + "/activityBoundaryBefore", schemaPath: "#/properties/activityBoundaryBefore/const", keyword: "const", params: { allowedValue: true }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
        }
        if (data.sequence !== void 0) {
          let data5 = data.sequence;
          if (!(typeof data5 == "number" && (!(data5 % 1) && !isNaN(data5)) && isFinite(data5))) {
            const err16 = { instancePath: instancePath + "/sequence", schemaPath: "#/properties/sequence/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
          if (typeof data5 == "number" && isFinite(data5)) {
            if (data5 > 9007199254740991 || isNaN(data5)) {
              const err17 = { instancePath: instancePath + "/sequence", schemaPath: "#/properties/sequence/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
          }
        }
        if (data.stepIndex !== void 0) {
          let data6 = data.stepIndex;
          if (!(typeof data6 == "number" && (!(data6 % 1) && !isNaN(data6)) && isFinite(data6))) {
            const err18 = { instancePath: instancePath + "/stepIndex", schemaPath: "#/properties/stepIndex/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err18];
            } else {
              vErrors.push(err18);
            }
            errors++;
          }
          if (typeof data6 == "number" && isFinite(data6)) {
            if (data6 > 9007199254740991 || isNaN(data6)) {
              const err19 = { instancePath: instancePath + "/stepIndex", schemaPath: "#/properties/stepIndex/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            }
          }
        }
        if (data.decisionKind !== void 0) {
          if (typeof data.decisionKind !== "string") {
            const err20 = { instancePath: instancePath + "/decisionKind", schemaPath: "#/properties/decisionKind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err20];
            } else {
              vErrors.push(err20);
            }
            errors++;
          }
        }
        if (data.toolId !== void 0) {
          if (typeof data.toolId !== "string") {
            const err21 = { instancePath: instancePath + "/toolId", schemaPath: "#/properties/toolId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err21];
            } else {
              vErrors.push(err21);
            }
            errors++;
          }
        }
        if (data.inputSummary !== void 0) {
          if (typeof data.inputSummary !== "string") {
            const err22 = { instancePath: instancePath + "/inputSummary", schemaPath: "#/properties/inputSummary/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err22];
            } else {
              vErrors.push(err22);
            }
            errors++;
          }
        }
        if (data.actionStatus !== void 0) {
          let data10 = data.actionStatus;
          if (typeof data10 !== "string") {
            const err23 = { instancePath: instancePath + "/actionStatus", schemaPath: "#/properties/actionStatus/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err23];
            } else {
              vErrors.push(err23);
            }
            errors++;
          }
          if (!(data10 === "awaiting_approval" || data10 === "approved" || data10 === "rejected")) {
            const err24 = { instancePath: instancePath + "/actionStatus", schemaPath: "#/properties/actionStatus/enum", keyword: "enum", params: { allowedValues: schema14.properties.actionStatus.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err24];
            } else {
              vErrors.push(err24);
            }
            errors++;
          }
        }
        if (data.status !== void 0) {
          let data11 = data.status;
          if (typeof data11 !== "string") {
            const err25 = { instancePath: instancePath + "/status", schemaPath: "#/properties/status/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err25];
            } else {
              vErrors.push(err25);
            }
            errors++;
          }
          if (!(data11 === "recorded" || data11 === "completed" || data11 === "failed" || data11 === "rejected")) {
            const err26 = { instancePath: instancePath + "/status", schemaPath: "#/properties/status/enum", keyword: "enum", params: { allowedValues: schema14.properties.status.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err26];
            } else {
              vErrors.push(err26);
            }
            errors++;
          }
        }
        if (data.summary !== void 0) {
          if (typeof data.summary !== "string") {
            const err27 = { instancePath: instancePath + "/summary", schemaPath: "#/properties/summary/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err27];
            } else {
              vErrors.push(err27);
            }
            errors++;
          }
        }
        if (data.think !== void 0) {
          let data13 = data.think;
          if (data13 && typeof data13 == "object" && !Array.isArray(data13)) {
            if (data13.goal === void 0) {
              const err28 = { instancePath: instancePath + "/think", schemaPath: "#/definitions/BrowserSessionStepThink/required", keyword: "required", params: { missingProperty: "goal" }, message: "must have required property 'goal'" };
              if (vErrors === null) {
                vErrors = [err28];
              } else {
                vErrors.push(err28);
              }
              errors++;
            }
            for (const key1 in data13) {
              if (!(key1 === "goal" || key1 === "output" || key1 === "truncated")) {
                const err29 = { instancePath: instancePath + "/think", schemaPath: "#/definitions/BrowserSessionStepThink/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err29];
                } else {
                  vErrors.push(err29);
                }
                errors++;
              }
            }
            if (data13.goal !== void 0) {
              if (typeof data13.goal !== "string") {
                const err30 = { instancePath: instancePath + "/think/goal", schemaPath: "#/definitions/BrowserSessionStepThink/properties/goal/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err30];
                } else {
                  vErrors.push(err30);
                }
                errors++;
              }
            }
            if (data13.output !== void 0) {
              if (typeof data13.output !== "string") {
                const err31 = { instancePath: instancePath + "/think/output", schemaPath: "#/definitions/BrowserSessionStepThink/properties/output/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err31];
                } else {
                  vErrors.push(err31);
                }
                errors++;
              }
            }
            if (data13.truncated !== void 0) {
              let data16 = data13.truncated;
              if (typeof data16 !== "boolean") {
                const err32 = { instancePath: instancePath + "/think/truncated", schemaPath: "#/definitions/BrowserSessionStepThink/properties/truncated/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                if (vErrors === null) {
                  vErrors = [err32];
                } else {
                  vErrors.push(err32);
                }
                errors++;
              }
              if (true !== data16) {
                const err33 = { instancePath: instancePath + "/think/truncated", schemaPath: "#/definitions/BrowserSessionStepThink/properties/truncated/const", keyword: "const", params: { allowedValue: true }, message: "must be equal to constant" };
                if (vErrors === null) {
                  vErrors = [err33];
                } else {
                  vErrors.push(err33);
                }
                errors++;
              }
            }
          } else {
            const err34 = { instancePath: instancePath + "/think", schemaPath: "#/definitions/BrowserSessionStepThink/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err34];
            } else {
              vErrors.push(err34);
            }
            errors++;
          }
        }
        if (data.bashExecution !== void 0) {
          let data17 = data.bashExecution;
          if (data17 && typeof data17 == "object" && !Array.isArray(data17)) {
            if (data17.command === void 0) {
              const err35 = { instancePath: instancePath + "/bashExecution", schemaPath: "#/definitions/BrowserBashExecutionDetail/required", keyword: "required", params: { missingProperty: "command" }, message: "must have required property 'command'" };
              if (vErrors === null) {
                vErrors = [err35];
              } else {
                vErrors.push(err35);
              }
              errors++;
            }
            for (const key2 in data17) {
              if (!(key2 === "command" || key2 === "exitCode" || key2 === "stdout" || key2 === "stderr" || key2 === "failure")) {
                const err36 = { instancePath: instancePath + "/bashExecution", schemaPath: "#/definitions/BrowserBashExecutionDetail/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err36];
                } else {
                  vErrors.push(err36);
                }
                errors++;
              }
            }
            if (data17.command !== void 0) {
              if (typeof data17.command !== "string") {
                const err37 = { instancePath: instancePath + "/bashExecution/command", schemaPath: "#/definitions/BrowserBashExecutionDetail/properties/command/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err37];
                } else {
                  vErrors.push(err37);
                }
                errors++;
              }
            }
            if (data17.exitCode !== void 0) {
              let data19 = data17.exitCode;
              if (!(typeof data19 == "number" && isFinite(data19))) {
                const err38 = { instancePath: instancePath + "/bashExecution/exitCode", schemaPath: "#/definitions/BrowserBashExecutionDetail/properties/exitCode/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                if (vErrors === null) {
                  vErrors = [err38];
                } else {
                  vErrors.push(err38);
                }
                errors++;
              }
            }
            if (data17.stdout !== void 0) {
              if (typeof data17.stdout !== "string") {
                const err39 = { instancePath: instancePath + "/bashExecution/stdout", schemaPath: "#/definitions/BrowserBashExecutionDetail/properties/stdout/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err39];
                } else {
                  vErrors.push(err39);
                }
                errors++;
              }
            }
            if (data17.stderr !== void 0) {
              if (typeof data17.stderr !== "string") {
                const err40 = { instancePath: instancePath + "/bashExecution/stderr", schemaPath: "#/definitions/BrowserBashExecutionDetail/properties/stderr/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err40];
                } else {
                  vErrors.push(err40);
                }
                errors++;
              }
            }
            if (data17.failure !== void 0) {
              if (typeof data17.failure !== "string") {
                const err41 = { instancePath: instancePath + "/bashExecution/failure", schemaPath: "#/definitions/BrowserBashExecutionDetail/properties/failure/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err41];
                } else {
                  vErrors.push(err41);
                }
                errors++;
              }
            }
          } else {
            const err42 = { instancePath: instancePath + "/bashExecution", schemaPath: "#/definitions/BrowserBashExecutionDetail/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err42];
            } else {
              vErrors.push(err42);
            }
            errors++;
          }
        }
        if (data.bashExecutionOmitted !== void 0) {
          let data23 = data.bashExecutionOmitted;
          if (typeof data23 !== "boolean") {
            const err43 = { instancePath: instancePath + "/bashExecutionOmitted", schemaPath: "#/properties/bashExecutionOmitted/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err43];
            } else {
              vErrors.push(err43);
            }
            errors++;
          }
          if (true !== data23) {
            const err44 = { instancePath: instancePath + "/bashExecutionOmitted", schemaPath: "#/properties/bashExecutionOmitted/const", keyword: "const", params: { allowedValue: true }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err44];
            } else {
              vErrors.push(err44);
            }
            errors++;
          }
        }
        if (data.recoveryAttempts !== void 0) {
          let data24 = data.recoveryAttempts;
          if (Array.isArray(data24)) {
            const len0 = data24.length;
            for (let i0 = 0; i0 < len0; i0++) {
              if (typeof data24[i0] !== "string") {
                const err45 = { instancePath: instancePath + "/recoveryAttempts/" + i0, schemaPath: "#/properties/recoveryAttempts/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err45];
                } else {
                  vErrors.push(err45);
                }
                errors++;
              }
            }
          } else {
            const err46 = { instancePath: instancePath + "/recoveryAttempts", schemaPath: "#/properties/recoveryAttempts/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err46];
            } else {
              vErrors.push(err46);
            }
            errors++;
          }
        }
        if (data.stageId !== void 0) {
          let data26 = data.stageId;
          if (typeof data26 === "string") {
            if (!pattern0.test(data26)) {
              const err47 = { instancePath: instancePath + "/stageId", schemaPath: "#/properties/stageId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err47];
              } else {
                vErrors.push(err47);
              }
              errors++;
            }
          } else {
            const err48 = { instancePath: instancePath + "/stageId", schemaPath: "#/properties/stageId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err48];
            } else {
              vErrors.push(err48);
            }
            errors++;
          }
        }
      } else {
        const err49 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err49];
        } else {
          vErrors.push(err49);
        }
        errors++;
      }
      validate12.errors = vErrors;
      return errors === 0;
    }
    var schema17 = { "type": "object", "properties": { "stageId": { "type": "string", "pattern": "\\S" }, "revision": { "type": "integer", "maximum": 9007199254740991 }, "target": { "type": "string" }, "acceptanceCriteria": { "type": "array", "items": { "type": "string" } }, "status": { "$ref": "#/definitions/BrowserRunStageStatus" }, "resultSummary": { "type": "string" }, "latestReviewRejection": { "$ref": "#/definitions/BrowserRunStageRejection" }, "previousStageResultRef": { "$ref": "#/definitions/BrowserRunStageResultRef" }, "revisions": { "type": "array", "items": { "$ref": "#/definitions/BrowserRunStageRevision" } }, "steps": { "type": "array", "items": { "$ref": "#/definitions/BrowserSessionStep" } } }, "required": ["stageId", "revision", "target", "acceptanceCriteria", "status", "steps"], "additionalProperties": false, "description": "Run \u4E2D\u6309\u7A33\u5B9A\u8EAB\u4EFD\u805A\u5408\u7684\u9636\u6BB5\u6267\u884C\u4E0E\u5BA1\u67E5\u8BB0\u5F55\u770B\u677F\u6295\u5F71\u3002" };
    var schema18 = { "type": "string", "enum": ["in_progress", "review_pending", "accepted"], "description": "\u9636\u6BB5\u751F\u547D\u5468\u671F\u72B6\u6001\u3002" };
    function validate14(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.stageId === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "stageId" }, message: "must have required property 'stageId'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.revision === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "revision" }, message: "must have required property 'revision'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.target === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "target" }, message: "must have required property 'target'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.acceptanceCriteria === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "acceptanceCriteria" }, message: "must have required property 'acceptanceCriteria'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.status === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data.steps === void 0) {
          const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "steps" }, message: "must have required property 'steps'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!func2.call(schema17.properties, key0)) {
            const err6 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.stageId !== void 0) {
          let data0 = data.stageId;
          if (typeof data0 === "string") {
            if (!pattern0.test(data0)) {
              const err7 = { instancePath: instancePath + "/stageId", schemaPath: "#/properties/stageId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
          } else {
            const err8 = { instancePath: instancePath + "/stageId", schemaPath: "#/properties/stageId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.revision !== void 0) {
          let data1 = data.revision;
          if (!(typeof data1 == "number" && (!(data1 % 1) && !isNaN(data1)) && isFinite(data1))) {
            const err9 = { instancePath: instancePath + "/revision", schemaPath: "#/properties/revision/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
          if (typeof data1 == "number" && isFinite(data1)) {
            if (data1 > 9007199254740991 || isNaN(data1)) {
              const err10 = { instancePath: instancePath + "/revision", schemaPath: "#/properties/revision/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
          }
        }
        if (data.target !== void 0) {
          if (typeof data.target !== "string") {
            const err11 = { instancePath: instancePath + "/target", schemaPath: "#/properties/target/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
        }
        if (data.acceptanceCriteria !== void 0) {
          let data3 = data.acceptanceCriteria;
          if (Array.isArray(data3)) {
            const len0 = data3.length;
            for (let i0 = 0; i0 < len0; i0++) {
              if (typeof data3[i0] !== "string") {
                const err12 = { instancePath: instancePath + "/acceptanceCriteria/" + i0, schemaPath: "#/properties/acceptanceCriteria/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err12];
                } else {
                  vErrors.push(err12);
                }
                errors++;
              }
            }
          } else {
            const err13 = { instancePath: instancePath + "/acceptanceCriteria", schemaPath: "#/properties/acceptanceCriteria/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        }
        if (data.status !== void 0) {
          let data5 = data.status;
          if (typeof data5 !== "string") {
            const err14 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/BrowserRunStageStatus/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
          if (!(data5 === "in_progress" || data5 === "review_pending" || data5 === "accepted")) {
            const err15 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/BrowserRunStageStatus/enum", keyword: "enum", params: { allowedValues: schema18.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
        }
        if (data.resultSummary !== void 0) {
          if (typeof data.resultSummary !== "string") {
            const err16 = { instancePath: instancePath + "/resultSummary", schemaPath: "#/properties/resultSummary/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
        }
        if (data.latestReviewRejection !== void 0) {
          let data7 = data.latestReviewRejection;
          if (data7 && typeof data7 == "object" && !Array.isArray(data7)) {
            if (data7.code === void 0) {
              const err17 = { instancePath: instancePath + "/latestReviewRejection", schemaPath: "#/definitions/BrowserRunStageRejection/required", keyword: "required", params: { missingProperty: "code" }, message: "must have required property 'code'" };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
            if (data7.issues === void 0) {
              const err18 = { instancePath: instancePath + "/latestReviewRejection", schemaPath: "#/definitions/BrowserRunStageRejection/required", keyword: "required", params: { missingProperty: "issues" }, message: "must have required property 'issues'" };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
            for (const key1 in data7) {
              if (!(key1 === "code" || key1 === "issues")) {
                const err19 = { instancePath: instancePath + "/latestReviewRejection", schemaPath: "#/definitions/BrowserRunStageRejection/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err19];
                } else {
                  vErrors.push(err19);
                }
                errors++;
              }
            }
            if (data7.code !== void 0) {
              if (typeof data7.code !== "string") {
                const err20 = { instancePath: instancePath + "/latestReviewRejection/code", schemaPath: "#/definitions/BrowserRunStageRejection/properties/code/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err20];
                } else {
                  vErrors.push(err20);
                }
                errors++;
              }
            }
            if (data7.issues !== void 0) {
              let data9 = data7.issues;
              if (Array.isArray(data9)) {
                const len1 = data9.length;
                for (let i1 = 0; i1 < len1; i1++) {
                  if (typeof data9[i1] !== "string") {
                    const err21 = { instancePath: instancePath + "/latestReviewRejection/issues/" + i1, schemaPath: "#/definitions/BrowserRunStageRejection/properties/issues/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err21];
                    } else {
                      vErrors.push(err21);
                    }
                    errors++;
                  }
                }
              } else {
                const err22 = { instancePath: instancePath + "/latestReviewRejection/issues", schemaPath: "#/definitions/BrowserRunStageRejection/properties/issues/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err22];
                } else {
                  vErrors.push(err22);
                }
                errors++;
              }
            }
          } else {
            const err23 = { instancePath: instancePath + "/latestReviewRejection", schemaPath: "#/definitions/BrowserRunStageRejection/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err23];
            } else {
              vErrors.push(err23);
            }
            errors++;
          }
        }
        if (data.previousStageResultRef !== void 0) {
          let data11 = data.previousStageResultRef;
          if (data11 && typeof data11 == "object" && !Array.isArray(data11)) {
            if (data11.stageId === void 0) {
              const err24 = { instancePath: instancePath + "/previousStageResultRef", schemaPath: "#/definitions/BrowserRunStageResultRef/required", keyword: "required", params: { missingProperty: "stageId" }, message: "must have required property 'stageId'" };
              if (vErrors === null) {
                vErrors = [err24];
              } else {
                vErrors.push(err24);
              }
              errors++;
            }
            if (data11.revision === void 0) {
              const err25 = { instancePath: instancePath + "/previousStageResultRef", schemaPath: "#/definitions/BrowserRunStageResultRef/required", keyword: "required", params: { missingProperty: "revision" }, message: "must have required property 'revision'" };
              if (vErrors === null) {
                vErrors = [err25];
              } else {
                vErrors.push(err25);
              }
              errors++;
            }
            for (const key2 in data11) {
              if (!(key2 === "stageId" || key2 === "revision")) {
                const err26 = { instancePath: instancePath + "/previousStageResultRef", schemaPath: "#/definitions/BrowserRunStageResultRef/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err26];
                } else {
                  vErrors.push(err26);
                }
                errors++;
              }
            }
            if (data11.stageId !== void 0) {
              let data12 = data11.stageId;
              if (typeof data12 === "string") {
                if (!pattern0.test(data12)) {
                  const err27 = { instancePath: instancePath + "/previousStageResultRef/stageId", schemaPath: "#/definitions/BrowserRunStageResultRef/properties/stageId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                  if (vErrors === null) {
                    vErrors = [err27];
                  } else {
                    vErrors.push(err27);
                  }
                  errors++;
                }
              } else {
                const err28 = { instancePath: instancePath + "/previousStageResultRef/stageId", schemaPath: "#/definitions/BrowserRunStageResultRef/properties/stageId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err28];
                } else {
                  vErrors.push(err28);
                }
                errors++;
              }
            }
            if (data11.revision !== void 0) {
              let data13 = data11.revision;
              if (!(typeof data13 == "number" && (!(data13 % 1) && !isNaN(data13)) && isFinite(data13))) {
                const err29 = { instancePath: instancePath + "/previousStageResultRef/revision", schemaPath: "#/definitions/BrowserRunStageResultRef/properties/revision/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err29];
                } else {
                  vErrors.push(err29);
                }
                errors++;
              }
              if (typeof data13 == "number" && isFinite(data13)) {
                if (data13 > 9007199254740991 || isNaN(data13)) {
                  const err30 = { instancePath: instancePath + "/previousStageResultRef/revision", schemaPath: "#/definitions/BrowserRunStageResultRef/properties/revision/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                  if (vErrors === null) {
                    vErrors = [err30];
                  } else {
                    vErrors.push(err30);
                  }
                  errors++;
                }
              }
            }
          } else {
            const err31 = { instancePath: instancePath + "/previousStageResultRef", schemaPath: "#/definitions/BrowserRunStageResultRef/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err31];
            } else {
              vErrors.push(err31);
            }
            errors++;
          }
        }
        if (data.revisions !== void 0) {
          let data14 = data.revisions;
          if (Array.isArray(data14)) {
            const len2 = data14.length;
            for (let i2 = 0; i2 < len2; i2++) {
              let data15 = data14[i2];
              if (data15 && typeof data15 == "object" && !Array.isArray(data15)) {
                if (data15.revision === void 0) {
                  const err32 = { instancePath: instancePath + "/revisions/" + i2, schemaPath: "#/definitions/BrowserRunStageRevision/required", keyword: "required", params: { missingProperty: "revision" }, message: "must have required property 'revision'" };
                  if (vErrors === null) {
                    vErrors = [err32];
                  } else {
                    vErrors.push(err32);
                  }
                  errors++;
                }
                if (data15.target === void 0) {
                  const err33 = { instancePath: instancePath + "/revisions/" + i2, schemaPath: "#/definitions/BrowserRunStageRevision/required", keyword: "required", params: { missingProperty: "target" }, message: "must have required property 'target'" };
                  if (vErrors === null) {
                    vErrors = [err33];
                  } else {
                    vErrors.push(err33);
                  }
                  errors++;
                }
                for (const key3 in data15) {
                  if (!(key3 === "revision" || key3 === "target" || key3 === "reason")) {
                    const err34 = { instancePath: instancePath + "/revisions/" + i2, schemaPath: "#/definitions/BrowserRunStageRevision/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err34];
                    } else {
                      vErrors.push(err34);
                    }
                    errors++;
                  }
                }
                if (data15.revision !== void 0) {
                  let data16 = data15.revision;
                  if (!(typeof data16 == "number" && isFinite(data16))) {
                    const err35 = { instancePath: instancePath + "/revisions/" + i2 + "/revision", schemaPath: "#/definitions/BrowserRunStageRevision/properties/revision/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                    if (vErrors === null) {
                      vErrors = [err35];
                    } else {
                      vErrors.push(err35);
                    }
                    errors++;
                  }
                }
                if (data15.target !== void 0) {
                  if (typeof data15.target !== "string") {
                    const err36 = { instancePath: instancePath + "/revisions/" + i2 + "/target", schemaPath: "#/definitions/BrowserRunStageRevision/properties/target/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err36];
                    } else {
                      vErrors.push(err36);
                    }
                    errors++;
                  }
                }
                if (data15.reason !== void 0) {
                  if (typeof data15.reason !== "string") {
                    const err37 = { instancePath: instancePath + "/revisions/" + i2 + "/reason", schemaPath: "#/definitions/BrowserRunStageRevision/properties/reason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err37];
                    } else {
                      vErrors.push(err37);
                    }
                    errors++;
                  }
                }
              } else {
                const err38 = { instancePath: instancePath + "/revisions/" + i2, schemaPath: "#/definitions/BrowserRunStageRevision/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err38];
                } else {
                  vErrors.push(err38);
                }
                errors++;
              }
            }
          } else {
            const err39 = { instancePath: instancePath + "/revisions", schemaPath: "#/properties/revisions/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err39];
            } else {
              vErrors.push(err39);
            }
            errors++;
          }
        }
        if (data.steps !== void 0) {
          let data19 = data.steps;
          if (Array.isArray(data19)) {
            const len3 = data19.length;
            for (let i3 = 0; i3 < len3; i3++) {
              if (!validate12(data19[i3], { instancePath: instancePath + "/steps/" + i3, parentData: data19, parentDataProperty: i3, rootData })) {
                vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                errors = vErrors.length;
              }
            }
          } else {
            const err40 = { instancePath: instancePath + "/steps", schemaPath: "#/properties/steps/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err40];
            } else {
              vErrors.push(err40);
            }
            errors++;
          }
        }
      } else {
        const err41 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err41];
        } else {
          vErrors.push(err41);
        }
        errors++;
      }
      validate14.errors = vErrors;
      return errors === 0;
    }
    var schema23 = { "type": "object", "properties": { "stageId": { "type": "string", "pattern": "\\S" }, "revision": { "type": "integer", "maximum": 9007199254740991, "minimum": 1 }, "status": { "type": "string", "enum": ["pending", "executing", "accepted"] }, "target": { "type": "string", "pattern": "\\S" }, "acceptanceCriteria": { "type": "array", "items": { "type": "string" } }, "acceptedSequence": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 } }, "required": ["stageId", "revision", "status", "target", "acceptanceCriteria"], "additionalProperties": false, "description": "\u5DF2\u6279\u51C6 Plan Run \u4E2D\u5E26 Runtime \u8EAB\u4EFD\u7684\u9636\u6BB5\u72B6\u6001\u3002" };
    function validate17(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.revision === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "revision" }, message: "must have required property 'revision'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.nextStageIndex === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "nextStageIndex" }, message: "must have required property 'nextStageIndex'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.stages === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "stages" }, message: "must have required property 'stages'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "revision" || key0 === "revisionReason" || key0 === "nextStageIndex" || key0 === "stages")) {
            const err3 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.revision !== void 0) {
          let data0 = data.revision;
          if (!(typeof data0 == "number" && (!(data0 % 1) && !isNaN(data0)) && isFinite(data0))) {
            const err4 = { instancePath: instancePath + "/revision", schemaPath: "#/properties/revision/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
          if (typeof data0 == "number" && isFinite(data0)) {
            if (data0 > 9007199254740991 || isNaN(data0)) {
              const err5 = { instancePath: instancePath + "/revision", schemaPath: "#/properties/revision/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err5];
              } else {
                vErrors.push(err5);
              }
              errors++;
            }
            if (data0 < 1 || isNaN(data0)) {
              const err6 = { instancePath: instancePath + "/revision", schemaPath: "#/properties/revision/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
              if (vErrors === null) {
                vErrors = [err6];
              } else {
                vErrors.push(err6);
              }
              errors++;
            }
          }
        }
        if (data.revisionReason !== void 0) {
          let data1 = data.revisionReason;
          if (typeof data1 === "string") {
            if (!pattern0.test(data1)) {
              const err7 = { instancePath: instancePath + "/revisionReason", schemaPath: "#/properties/revisionReason/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
          } else {
            const err8 = { instancePath: instancePath + "/revisionReason", schemaPath: "#/properties/revisionReason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.nextStageIndex !== void 0) {
          let data2 = data.nextStageIndex;
          if (!(typeof data2 == "number" && (!(data2 % 1) && !isNaN(data2)) && isFinite(data2))) {
            const err9 = { instancePath: instancePath + "/nextStageIndex", schemaPath: "#/properties/nextStageIndex/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
          if (typeof data2 == "number" && isFinite(data2)) {
            if (data2 > 9007199254740991 || isNaN(data2)) {
              const err10 = { instancePath: instancePath + "/nextStageIndex", schemaPath: "#/properties/nextStageIndex/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
            if (data2 < 0 || isNaN(data2)) {
              const err11 = { instancePath: instancePath + "/nextStageIndex", schemaPath: "#/properties/nextStageIndex/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
          }
        }
        if (data.stages !== void 0) {
          let data3 = data.stages;
          if (Array.isArray(data3)) {
            const len0 = data3.length;
            for (let i0 = 0; i0 < len0; i0++) {
              let data4 = data3[i0];
              if (data4 && typeof data4 == "object" && !Array.isArray(data4)) {
                if (data4.stageId === void 0) {
                  const err12 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/definitions/BrowserPlanRouteStageState/required", keyword: "required", params: { missingProperty: "stageId" }, message: "must have required property 'stageId'" };
                  if (vErrors === null) {
                    vErrors = [err12];
                  } else {
                    vErrors.push(err12);
                  }
                  errors++;
                }
                if (data4.revision === void 0) {
                  const err13 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/definitions/BrowserPlanRouteStageState/required", keyword: "required", params: { missingProperty: "revision" }, message: "must have required property 'revision'" };
                  if (vErrors === null) {
                    vErrors = [err13];
                  } else {
                    vErrors.push(err13);
                  }
                  errors++;
                }
                if (data4.status === void 0) {
                  const err14 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/definitions/BrowserPlanRouteStageState/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
                  if (vErrors === null) {
                    vErrors = [err14];
                  } else {
                    vErrors.push(err14);
                  }
                  errors++;
                }
                if (data4.target === void 0) {
                  const err15 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/definitions/BrowserPlanRouteStageState/required", keyword: "required", params: { missingProperty: "target" }, message: "must have required property 'target'" };
                  if (vErrors === null) {
                    vErrors = [err15];
                  } else {
                    vErrors.push(err15);
                  }
                  errors++;
                }
                if (data4.acceptanceCriteria === void 0) {
                  const err16 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/definitions/BrowserPlanRouteStageState/required", keyword: "required", params: { missingProperty: "acceptanceCriteria" }, message: "must have required property 'acceptanceCriteria'" };
                  if (vErrors === null) {
                    vErrors = [err16];
                  } else {
                    vErrors.push(err16);
                  }
                  errors++;
                }
                for (const key1 in data4) {
                  if (!(key1 === "stageId" || key1 === "revision" || key1 === "status" || key1 === "target" || key1 === "acceptanceCriteria" || key1 === "acceptedSequence")) {
                    const err17 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/definitions/BrowserPlanRouteStageState/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err17];
                    } else {
                      vErrors.push(err17);
                    }
                    errors++;
                  }
                }
                if (data4.stageId !== void 0) {
                  let data5 = data4.stageId;
                  if (typeof data5 === "string") {
                    if (!pattern0.test(data5)) {
                      const err18 = { instancePath: instancePath + "/stages/" + i0 + "/stageId", schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/stageId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err18];
                      } else {
                        vErrors.push(err18);
                      }
                      errors++;
                    }
                  } else {
                    const err19 = { instancePath: instancePath + "/stages/" + i0 + "/stageId", schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/stageId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err19];
                    } else {
                      vErrors.push(err19);
                    }
                    errors++;
                  }
                }
                if (data4.revision !== void 0) {
                  let data6 = data4.revision;
                  if (!(typeof data6 == "number" && (!(data6 % 1) && !isNaN(data6)) && isFinite(data6))) {
                    const err20 = { instancePath: instancePath + "/stages/" + i0 + "/revision", schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/revision/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err20];
                    } else {
                      vErrors.push(err20);
                    }
                    errors++;
                  }
                  if (typeof data6 == "number" && isFinite(data6)) {
                    if (data6 > 9007199254740991 || isNaN(data6)) {
                      const err21 = { instancePath: instancePath + "/stages/" + i0 + "/revision", schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/revision/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                      if (vErrors === null) {
                        vErrors = [err21];
                      } else {
                        vErrors.push(err21);
                      }
                      errors++;
                    }
                    if (data6 < 1 || isNaN(data6)) {
                      const err22 = { instancePath: instancePath + "/stages/" + i0 + "/revision", schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/revision/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
                      if (vErrors === null) {
                        vErrors = [err22];
                      } else {
                        vErrors.push(err22);
                      }
                      errors++;
                    }
                  }
                }
                if (data4.status !== void 0) {
                  let data7 = data4.status;
                  if (typeof data7 !== "string") {
                    const err23 = { instancePath: instancePath + "/stages/" + i0 + "/status", schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/status/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err23];
                    } else {
                      vErrors.push(err23);
                    }
                    errors++;
                  }
                  if (!(data7 === "pending" || data7 === "executing" || data7 === "accepted")) {
                    const err24 = { instancePath: instancePath + "/stages/" + i0 + "/status", schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/status/enum", keyword: "enum", params: { allowedValues: schema23.properties.status.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err24];
                    } else {
                      vErrors.push(err24);
                    }
                    errors++;
                  }
                }
                if (data4.target !== void 0) {
                  let data8 = data4.target;
                  if (typeof data8 === "string") {
                    if (!pattern0.test(data8)) {
                      const err25 = { instancePath: instancePath + "/stages/" + i0 + "/target", schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/target/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err25];
                      } else {
                        vErrors.push(err25);
                      }
                      errors++;
                    }
                  } else {
                    const err26 = { instancePath: instancePath + "/stages/" + i0 + "/target", schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/target/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err26];
                    } else {
                      vErrors.push(err26);
                    }
                    errors++;
                  }
                }
                if (data4.acceptanceCriteria !== void 0) {
                  let data9 = data4.acceptanceCriteria;
                  if (Array.isArray(data9)) {
                    const len1 = data9.length;
                    for (let i1 = 0; i1 < len1; i1++) {
                      if (typeof data9[i1] !== "string") {
                        const err27 = { instancePath: instancePath + "/stages/" + i0 + "/acceptanceCriteria/" + i1, schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/acceptanceCriteria/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err27];
                        } else {
                          vErrors.push(err27);
                        }
                        errors++;
                      }
                    }
                  } else {
                    const err28 = { instancePath: instancePath + "/stages/" + i0 + "/acceptanceCriteria", schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/acceptanceCriteria/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                    if (vErrors === null) {
                      vErrors = [err28];
                    } else {
                      vErrors.push(err28);
                    }
                    errors++;
                  }
                }
                if (data4.acceptedSequence !== void 0) {
                  let data11 = data4.acceptedSequence;
                  if (!(typeof data11 == "number" && (!(data11 % 1) && !isNaN(data11)) && isFinite(data11))) {
                    const err29 = { instancePath: instancePath + "/stages/" + i0 + "/acceptedSequence", schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/acceptedSequence/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err29];
                    } else {
                      vErrors.push(err29);
                    }
                    errors++;
                  }
                  if (typeof data11 == "number" && isFinite(data11)) {
                    if (data11 > 9007199254740991 || isNaN(data11)) {
                      const err30 = { instancePath: instancePath + "/stages/" + i0 + "/acceptedSequence", schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/acceptedSequence/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                      if (vErrors === null) {
                        vErrors = [err30];
                      } else {
                        vErrors.push(err30);
                      }
                      errors++;
                    }
                    if (data11 < 0 || isNaN(data11)) {
                      const err31 = { instancePath: instancePath + "/stages/" + i0 + "/acceptedSequence", schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/acceptedSequence/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                      if (vErrors === null) {
                        vErrors = [err31];
                      } else {
                        vErrors.push(err31);
                      }
                      errors++;
                    }
                  }
                }
              } else {
                const err32 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/definitions/BrowserPlanRouteStageState/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err32];
                } else {
                  vErrors.push(err32);
                }
                errors++;
              }
            }
          } else {
            const err33 = { instancePath: instancePath + "/stages", schemaPath: "#/properties/stages/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err33];
            } else {
              vErrors.push(err33);
            }
            errors++;
          }
        }
      } else {
        const err34 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err34];
        } else {
          vErrors.push(err34);
        }
        errors++;
      }
      validate17.errors = vErrors;
      return errors === 0;
    }
    function validate11(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.runId === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.status === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.stepCount === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "stepCount" }, message: "must have required property 'stepCount'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.steps === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "steps" }, message: "must have required property 'steps'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.current === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "current" }, message: "must have required property 'current'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "runId" || key0 === "status" || key0 === "stepCount" || key0 === "steps" || key0 === "current" || key0 === "stages" || key0 === "planRoute" || key0 === "terminalDetail")) {
            const err5 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.runId !== void 0) {
          let data0 = data.runId;
          if (typeof data0 === "string") {
            if (!pattern0.test(data0)) {
              const err6 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err6];
              } else {
                vErrors.push(err6);
              }
              errors++;
            }
          } else {
            const err7 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.status !== void 0) {
          let data1 = data.status;
          if (typeof data1 !== "string") {
            const err8 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/BrowserRunStatus/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
          if (!(data1 === "created" || data1 === "running" || data1 === "waiting" || data1 === "completed" || data1 === "failed" || data1 === "cancelled")) {
            const err9 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/BrowserRunStatus/enum", keyword: "enum", params: { allowedValues: schema13.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data.stepCount !== void 0) {
          let data2 = data.stepCount;
          if (!(typeof data2 == "number" && (!(data2 % 1) && !isNaN(data2)) && isFinite(data2))) {
            const err10 = { instancePath: instancePath + "/stepCount", schemaPath: "#/properties/stepCount/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
          if (typeof data2 == "number" && isFinite(data2)) {
            if (data2 > 9007199254740991 || isNaN(data2)) {
              const err11 = { instancePath: instancePath + "/stepCount", schemaPath: "#/properties/stepCount/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
          }
        }
        if (data.steps !== void 0) {
          let data3 = data.steps;
          if (Array.isArray(data3)) {
            const len0 = data3.length;
            for (let i0 = 0; i0 < len0; i0++) {
              if (!validate12(data3[i0], { instancePath: instancePath + "/steps/" + i0, parentData: data3, parentDataProperty: i0, rootData })) {
                vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                errors = vErrors.length;
              }
            }
          } else {
            const err12 = { instancePath: instancePath + "/steps", schemaPath: "#/properties/steps/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data.current !== void 0) {
          if (typeof data.current !== "boolean") {
            const err13 = { instancePath: instancePath + "/current", schemaPath: "#/properties/current/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        }
        if (data.stages !== void 0) {
          let data6 = data.stages;
          if (Array.isArray(data6)) {
            const len1 = data6.length;
            for (let i1 = 0; i1 < len1; i1++) {
              if (!validate14(data6[i1], { instancePath: instancePath + "/stages/" + i1, parentData: data6, parentDataProperty: i1, rootData })) {
                vErrors = vErrors === null ? validate14.errors : vErrors.concat(validate14.errors);
                errors = vErrors.length;
              }
            }
          } else {
            const err14 = { instancePath: instancePath + "/stages", schemaPath: "#/properties/stages/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
        }
        if (data.planRoute !== void 0) {
          if (!validate17(data.planRoute, { instancePath: instancePath + "/planRoute", parentData: data, parentDataProperty: "planRoute", rootData })) {
            vErrors = vErrors === null ? validate17.errors : vErrors.concat(validate17.errors);
            errors = vErrors.length;
          }
        }
        if (data.terminalDetail !== void 0) {
          let data9 = data.terminalDetail;
          if (data9 && typeof data9 == "object" && !Array.isArray(data9)) {
            if (data9.message === void 0) {
              const err15 = { instancePath: instancePath + "/terminalDetail", schemaPath: "#/definitions/BrowserSessionRunTerminalDetail/required", keyword: "required", params: { missingProperty: "message" }, message: "must have required property 'message'" };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
            for (const key1 in data9) {
              if (!(key1 === "code" || key1 === "message")) {
                const err16 = { instancePath: instancePath + "/terminalDetail", schemaPath: "#/definitions/BrowserSessionRunTerminalDetail/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err16];
                } else {
                  vErrors.push(err16);
                }
                errors++;
              }
            }
            if (data9.code !== void 0) {
              if (typeof data9.code !== "string") {
                const err17 = { instancePath: instancePath + "/terminalDetail/code", schemaPath: "#/definitions/BrowserSessionRunTerminalDetail/properties/code/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err17];
                } else {
                  vErrors.push(err17);
                }
                errors++;
              }
            }
            if (data9.message !== void 0) {
              if (typeof data9.message !== "string") {
                const err18 = { instancePath: instancePath + "/terminalDetail/message", schemaPath: "#/definitions/BrowserSessionRunTerminalDetail/properties/message/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err18];
                } else {
                  vErrors.push(err18);
                }
                errors++;
              }
            }
          } else {
            const err19 = { instancePath: instancePath + "/terminalDetail", schemaPath: "#/definitions/BrowserSessionRunTerminalDetail/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          }
        }
      } else {
        const err20 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
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
export default require_BrowserSessionRun_validator();
