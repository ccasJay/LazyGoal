var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// BrowserTrajectoryEntry-validator.cjs
var require_BrowserTrajectoryEntry_validator = __commonJS({
  "BrowserTrajectoryEntry-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema12 = { "type": "object", "properties": { "eventId": { "type": "string", "pattern": "\\S" }, "sequence": { "type": "integer", "maximum": 9007199254740991, "minimum": 1 }, "occurredAt": { "type": "string" }, "eventType": { "type": "string" }, "category": { "type": "string", "enum": ["lifecycle", "decision", "memory", "action", "tool", "observation", "terminal", "commit"] }, "executionUnitId": { "type": "string", "pattern": "\\S" }, "stepIndex": { "type": "integer", "maximum": 9007199254740991 }, "actionId": { "type": "string", "pattern": "\\S" }, "programId": { "type": "string", "pattern": "\\S" }, "callIndex": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "parentActionId": { "type": "string", "pattern": "\\S" }, "title": { "type": "string" }, "preview": { "type": "string" }, "previewTruncated": { "type": "boolean" }, "inputPreview": { "type": "string" }, "resultPreview": { "type": "string" }, "modelCallId": { "type": "string" }, "modelStage": { "type": "string", "enum": ["think", "decide"] } }, "required": ["eventId", "sequence", "occurredAt", "eventType", "category", "title", "preview", "previewTruncated"], "additionalProperties": false, "description": "\u5355\u6761\u8F68\u8FF9\u4E8B\u4EF6\u5217\u8868\u6761\u76EE\u3002" };
    var func2 = Object.prototype.hasOwnProperty;
    var pattern0 = new RegExp("\\S", "u");
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.eventId === void 0) {
          const err0 = { instancePath, schemaPath: "#/definitions/BrowserTrajectoryEntry/required", keyword: "required", params: { missingProperty: "eventId" }, message: "must have required property 'eventId'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.sequence === void 0) {
          const err1 = { instancePath, schemaPath: "#/definitions/BrowserTrajectoryEntry/required", keyword: "required", params: { missingProperty: "sequence" }, message: "must have required property 'sequence'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.occurredAt === void 0) {
          const err2 = { instancePath, schemaPath: "#/definitions/BrowserTrajectoryEntry/required", keyword: "required", params: { missingProperty: "occurredAt" }, message: "must have required property 'occurredAt'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.eventType === void 0) {
          const err3 = { instancePath, schemaPath: "#/definitions/BrowserTrajectoryEntry/required", keyword: "required", params: { missingProperty: "eventType" }, message: "must have required property 'eventType'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.category === void 0) {
          const err4 = { instancePath, schemaPath: "#/definitions/BrowserTrajectoryEntry/required", keyword: "required", params: { missingProperty: "category" }, message: "must have required property 'category'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data.title === void 0) {
          const err5 = { instancePath, schemaPath: "#/definitions/BrowserTrajectoryEntry/required", keyword: "required", params: { missingProperty: "title" }, message: "must have required property 'title'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        if (data.preview === void 0) {
          const err6 = { instancePath, schemaPath: "#/definitions/BrowserTrajectoryEntry/required", keyword: "required", params: { missingProperty: "preview" }, message: "must have required property 'preview'" };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        if (data.previewTruncated === void 0) {
          const err7 = { instancePath, schemaPath: "#/definitions/BrowserTrajectoryEntry/required", keyword: "required", params: { missingProperty: "previewTruncated" }, message: "must have required property 'previewTruncated'" };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!func2.call(schema12.properties, key0)) {
            const err8 = { instancePath, schemaPath: "#/definitions/BrowserTrajectoryEntry/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
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
              const err9 = { instancePath: instancePath + "/eventId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/eventId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
          } else {
            const err10 = { instancePath: instancePath + "/eventId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/eventId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data.sequence !== void 0) {
          let data1 = data.sequence;
          if (!(typeof data1 == "number" && (!(data1 % 1) && !isNaN(data1)) && isFinite(data1))) {
            const err11 = { instancePath: instancePath + "/sequence", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/sequence/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
          if (typeof data1 == "number" && isFinite(data1)) {
            if (data1 > 9007199254740991 || isNaN(data1)) {
              const err12 = { instancePath: instancePath + "/sequence", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/sequence/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
            if (data1 < 1 || isNaN(data1)) {
              const err13 = { instancePath: instancePath + "/sequence", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/sequence/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
          }
        }
        if (data.occurredAt !== void 0) {
          if (typeof data.occurredAt !== "string") {
            const err14 = { instancePath: instancePath + "/occurredAt", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/occurredAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
        }
        if (data.eventType !== void 0) {
          if (typeof data.eventType !== "string") {
            const err15 = { instancePath: instancePath + "/eventType", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/eventType/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
        }
        if (data.category !== void 0) {
          let data4 = data.category;
          if (typeof data4 !== "string") {
            const err16 = { instancePath: instancePath + "/category", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/category/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
          if (!(data4 === "lifecycle" || data4 === "decision" || data4 === "memory" || data4 === "action" || data4 === "tool" || data4 === "observation" || data4 === "terminal" || data4 === "commit")) {
            const err17 = { instancePath: instancePath + "/category", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/category/enum", keyword: "enum", params: { allowedValues: schema12.properties.category.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
        }
        if (data.executionUnitId !== void 0) {
          let data5 = data.executionUnitId;
          if (typeof data5 === "string") {
            if (!pattern0.test(data5)) {
              const err18 = { instancePath: instancePath + "/executionUnitId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/executionUnitId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
          } else {
            const err19 = { instancePath: instancePath + "/executionUnitId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/executionUnitId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          }
        }
        if (data.stepIndex !== void 0) {
          let data6 = data.stepIndex;
          if (!(typeof data6 == "number" && (!(data6 % 1) && !isNaN(data6)) && isFinite(data6))) {
            const err20 = { instancePath: instancePath + "/stepIndex", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/stepIndex/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err20];
            } else {
              vErrors.push(err20);
            }
            errors++;
          }
          if (typeof data6 == "number" && isFinite(data6)) {
            if (data6 > 9007199254740991 || isNaN(data6)) {
              const err21 = { instancePath: instancePath + "/stepIndex", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/stepIndex/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            }
          }
        }
        if (data.actionId !== void 0) {
          let data7 = data.actionId;
          if (typeof data7 === "string") {
            if (!pattern0.test(data7)) {
              const err22 = { instancePath: instancePath + "/actionId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/actionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err22];
              } else {
                vErrors.push(err22);
              }
              errors++;
            }
          } else {
            const err23 = { instancePath: instancePath + "/actionId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err23];
            } else {
              vErrors.push(err23);
            }
            errors++;
          }
        }
        if (data.programId !== void 0) {
          let data8 = data.programId;
          if (typeof data8 === "string") {
            if (!pattern0.test(data8)) {
              const err24 = { instancePath: instancePath + "/programId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/programId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err24];
              } else {
                vErrors.push(err24);
              }
              errors++;
            }
          } else {
            const err25 = { instancePath: instancePath + "/programId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/programId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err25];
            } else {
              vErrors.push(err25);
            }
            errors++;
          }
        }
        if (data.callIndex !== void 0) {
          let data9 = data.callIndex;
          if (!(typeof data9 == "number" && (!(data9 % 1) && !isNaN(data9)) && isFinite(data9))) {
            const err26 = { instancePath: instancePath + "/callIndex", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/callIndex/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err26];
            } else {
              vErrors.push(err26);
            }
            errors++;
          }
          if (typeof data9 == "number" && isFinite(data9)) {
            if (data9 > 9007199254740991 || isNaN(data9)) {
              const err27 = { instancePath: instancePath + "/callIndex", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/callIndex/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err27];
              } else {
                vErrors.push(err27);
              }
              errors++;
            }
            if (data9 < 0 || isNaN(data9)) {
              const err28 = { instancePath: instancePath + "/callIndex", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/callIndex/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err28];
              } else {
                vErrors.push(err28);
              }
              errors++;
            }
          }
        }
        if (data.parentActionId !== void 0) {
          let data10 = data.parentActionId;
          if (typeof data10 === "string") {
            if (!pattern0.test(data10)) {
              const err29 = { instancePath: instancePath + "/parentActionId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/parentActionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err29];
              } else {
                vErrors.push(err29);
              }
              errors++;
            }
          } else {
            const err30 = { instancePath: instancePath + "/parentActionId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/parentActionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err30];
            } else {
              vErrors.push(err30);
            }
            errors++;
          }
        }
        if (data.title !== void 0) {
          if (typeof data.title !== "string") {
            const err31 = { instancePath: instancePath + "/title", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/title/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err31];
            } else {
              vErrors.push(err31);
            }
            errors++;
          }
        }
        if (data.preview !== void 0) {
          if (typeof data.preview !== "string") {
            const err32 = { instancePath: instancePath + "/preview", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/preview/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err32];
            } else {
              vErrors.push(err32);
            }
            errors++;
          }
        }
        if (data.previewTruncated !== void 0) {
          if (typeof data.previewTruncated !== "boolean") {
            const err33 = { instancePath: instancePath + "/previewTruncated", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/previewTruncated/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err33];
            } else {
              vErrors.push(err33);
            }
            errors++;
          }
        }
        if (data.inputPreview !== void 0) {
          if (typeof data.inputPreview !== "string") {
            const err34 = { instancePath: instancePath + "/inputPreview", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/inputPreview/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err34];
            } else {
              vErrors.push(err34);
            }
            errors++;
          }
        }
        if (data.resultPreview !== void 0) {
          if (typeof data.resultPreview !== "string") {
            const err35 = { instancePath: instancePath + "/resultPreview", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/resultPreview/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err35];
            } else {
              vErrors.push(err35);
            }
            errors++;
          }
        }
        if (data.modelCallId !== void 0) {
          if (typeof data.modelCallId !== "string") {
            const err36 = { instancePath: instancePath + "/modelCallId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/modelCallId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err36];
            } else {
              vErrors.push(err36);
            }
            errors++;
          }
        }
        if (data.modelStage !== void 0) {
          let data17 = data.modelStage;
          if (typeof data17 !== "string") {
            const err37 = { instancePath: instancePath + "/modelStage", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/modelStage/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err37];
            } else {
              vErrors.push(err37);
            }
            errors++;
          }
          if (!(data17 === "think" || data17 === "decide")) {
            const err38 = { instancePath: instancePath + "/modelStage", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/modelStage/enum", keyword: "enum", params: { allowedValues: schema12.properties.modelStage.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err38];
            } else {
              vErrors.push(err38);
            }
            errors++;
          }
        }
      } else {
        const err39 = { instancePath, schemaPath: "#/definitions/BrowserTrajectoryEntry/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err39];
        } else {
          vErrors.push(err39);
        }
        errors++;
      }
      validate10.errors = vErrors;
      return errors === 0;
    }
  }
});
export default require_BrowserTrajectoryEntry_validator();
