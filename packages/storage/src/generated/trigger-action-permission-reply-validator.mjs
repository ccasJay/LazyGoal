var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// TriggerActionPermissionReply-validator.cjs
var require_TriggerActionPermissionReply_validator = __commonJS({
  "TriggerActionPermissionReply-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema12 = { "type": "object", "properties": { "type": { "type": "string", "const": "action_approval_reply", "description": "\u4F9B\u6301\u4E45\u5316 Codec \u9009\u62E9\u5F53\u524D\u56DE\u590D\u534F\u8BAE\u3002" }, "requestDeliveryId": { "type": "string", "description": "\u5DF2\u6301\u4E45\u5316\u7684 Worker \u8BF7\u6C42\u6295\u9012\u8EAB\u4EFD\u3002" }, "requestId": { "type": "string", "description": "\u539F Worker \u8BF7\u6C42\u4E0E Trigger \u8EAB\u4EFD\u3002" }, "runId": { "type": "string", "description": "\u539F\u8BF7\u6C42\u6240\u5C5E Run\u3002" }, "actionId": { "type": "string", "description": "\u539F\u8BF7\u6C42\u4E2D\u7684\u5F85\u5BA1\u6279 Action\u3002" }, "interactionId": { "type": "string", "description": "\u539F\u8BF7\u6C42\u4E2D\u7684 Runtime \u4EA4\u4E92\u8EAB\u4EFD\u3002" }, "commitRevision": { "type": "number", "description": "\u539F\u8BF7\u6C42\u57FA\u4E8E\u7684 Goal Snapshot \u4FEE\u8BA2\u3002" }, "workerId": { "type": "string", "description": "\u6267\u884C\u8BF7\u6C42\u7684\u903B\u8F91 Worker\u3002" }, "generation": { "type": "string", "description": "\u5F53\u524D Worker OS \u8FDB\u7A0B\u4EE3\u6B21\u3002" }, "decision": { "type": "string", "enum": ["approve", "reject"], "description": "\u5BF9\u5F53\u524D Action \u4F5C\u51FA\u6279\u51C6\u6216\u62D2\u7EDD\u3002" }, "scope": { "type": "string", "const": "action", "description": "\u6279\u51C6\u53EA\u5141\u8BB8\u5BF9\u8BE5 Action \u751F\u6548\u4E00\u6B21\u3002" }, "reason": { "type": "string", "description": "\u62D2\u7EDD\u8BE5 Action \u7684\u975E\u7A7A\u7406\u7531\u3002" } }, "required": ["type", "requestDeliveryId", "requestId", "runId", "actionId", "interactionId", "commitRevision", "workerId", "generation", "decision"], "additionalProperties": false, "description": "Supervisor \u6216\u83B7\u51C6\u7528\u6237\u5BF9\u5F53\u524D Action \u5BA1\u6279 Trigger \u7684\u56DE\u590D\u8F7D\u8377\u3002" };
    var func2 = Object.prototype.hasOwnProperty;
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.type === void 0) {
          const err0 = { instancePath, schemaPath: "#/definitions/TriggerActionPermissionReply/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.requestDeliveryId === void 0) {
          const err1 = { instancePath, schemaPath: "#/definitions/TriggerActionPermissionReply/required", keyword: "required", params: { missingProperty: "requestDeliveryId" }, message: "must have required property 'requestDeliveryId'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.requestId === void 0) {
          const err2 = { instancePath, schemaPath: "#/definitions/TriggerActionPermissionReply/required", keyword: "required", params: { missingProperty: "requestId" }, message: "must have required property 'requestId'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.runId === void 0) {
          const err3 = { instancePath, schemaPath: "#/definitions/TriggerActionPermissionReply/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.actionId === void 0) {
          const err4 = { instancePath, schemaPath: "#/definitions/TriggerActionPermissionReply/required", keyword: "required", params: { missingProperty: "actionId" }, message: "must have required property 'actionId'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data.interactionId === void 0) {
          const err5 = { instancePath, schemaPath: "#/definitions/TriggerActionPermissionReply/required", keyword: "required", params: { missingProperty: "interactionId" }, message: "must have required property 'interactionId'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        if (data.commitRevision === void 0) {
          const err6 = { instancePath, schemaPath: "#/definitions/TriggerActionPermissionReply/required", keyword: "required", params: { missingProperty: "commitRevision" }, message: "must have required property 'commitRevision'" };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        if (data.workerId === void 0) {
          const err7 = { instancePath, schemaPath: "#/definitions/TriggerActionPermissionReply/required", keyword: "required", params: { missingProperty: "workerId" }, message: "must have required property 'workerId'" };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        if (data.generation === void 0) {
          const err8 = { instancePath, schemaPath: "#/definitions/TriggerActionPermissionReply/required", keyword: "required", params: { missingProperty: "generation" }, message: "must have required property 'generation'" };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
        if (data.decision === void 0) {
          const err9 = { instancePath, schemaPath: "#/definitions/TriggerActionPermissionReply/required", keyword: "required", params: { missingProperty: "decision" }, message: "must have required property 'decision'" };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!func2.call(schema12.properties, key0)) {
            const err10 = { instancePath, schemaPath: "#/definitions/TriggerActionPermissionReply/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data.type !== void 0) {
          let data0 = data.type;
          if (typeof data0 !== "string") {
            const err11 = { instancePath: instancePath + "/type", schemaPath: "#/definitions/TriggerActionPermissionReply/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
          if ("action_approval_reply" !== data0) {
            const err12 = { instancePath: instancePath + "/type", schemaPath: "#/definitions/TriggerActionPermissionReply/properties/type/const", keyword: "const", params: { allowedValue: "action_approval_reply" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data.requestDeliveryId !== void 0) {
          if (typeof data.requestDeliveryId !== "string") {
            const err13 = { instancePath: instancePath + "/requestDeliveryId", schemaPath: "#/definitions/TriggerActionPermissionReply/properties/requestDeliveryId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        }
        if (data.requestId !== void 0) {
          if (typeof data.requestId !== "string") {
            const err14 = { instancePath: instancePath + "/requestId", schemaPath: "#/definitions/TriggerActionPermissionReply/properties/requestId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
        }
        if (data.runId !== void 0) {
          if (typeof data.runId !== "string") {
            const err15 = { instancePath: instancePath + "/runId", schemaPath: "#/definitions/TriggerActionPermissionReply/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
        }
        if (data.actionId !== void 0) {
          if (typeof data.actionId !== "string") {
            const err16 = { instancePath: instancePath + "/actionId", schemaPath: "#/definitions/TriggerActionPermissionReply/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
        }
        if (data.interactionId !== void 0) {
          if (typeof data.interactionId !== "string") {
            const err17 = { instancePath: instancePath + "/interactionId", schemaPath: "#/definitions/TriggerActionPermissionReply/properties/interactionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
        }
        if (data.commitRevision !== void 0) {
          let data6 = data.commitRevision;
          if (!(typeof data6 == "number" && isFinite(data6))) {
            const err18 = { instancePath: instancePath + "/commitRevision", schemaPath: "#/definitions/TriggerActionPermissionReply/properties/commitRevision/type", keyword: "type", params: { type: "number" }, message: "must be number" };
            if (vErrors === null) {
              vErrors = [err18];
            } else {
              vErrors.push(err18);
            }
            errors++;
          }
        }
        if (data.workerId !== void 0) {
          if (typeof data.workerId !== "string") {
            const err19 = { instancePath: instancePath + "/workerId", schemaPath: "#/definitions/TriggerActionPermissionReply/properties/workerId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          }
        }
        if (data.generation !== void 0) {
          if (typeof data.generation !== "string") {
            const err20 = { instancePath: instancePath + "/generation", schemaPath: "#/definitions/TriggerActionPermissionReply/properties/generation/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err20];
            } else {
              vErrors.push(err20);
            }
            errors++;
          }
        }
        if (data.decision !== void 0) {
          let data9 = data.decision;
          if (typeof data9 !== "string") {
            const err21 = { instancePath: instancePath + "/decision", schemaPath: "#/definitions/TriggerActionPermissionReply/properties/decision/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err21];
            } else {
              vErrors.push(err21);
            }
            errors++;
          }
          if (!(data9 === "approve" || data9 === "reject")) {
            const err22 = { instancePath: instancePath + "/decision", schemaPath: "#/definitions/TriggerActionPermissionReply/properties/decision/enum", keyword: "enum", params: { allowedValues: schema12.properties.decision.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err22];
            } else {
              vErrors.push(err22);
            }
            errors++;
          }
        }
        if (data.scope !== void 0) {
          let data10 = data.scope;
          if (typeof data10 !== "string") {
            const err23 = { instancePath: instancePath + "/scope", schemaPath: "#/definitions/TriggerActionPermissionReply/properties/scope/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err23];
            } else {
              vErrors.push(err23);
            }
            errors++;
          }
          if ("action" !== data10) {
            const err24 = { instancePath: instancePath + "/scope", schemaPath: "#/definitions/TriggerActionPermissionReply/properties/scope/const", keyword: "const", params: { allowedValue: "action" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err24];
            } else {
              vErrors.push(err24);
            }
            errors++;
          }
        }
        if (data.reason !== void 0) {
          if (typeof data.reason !== "string") {
            const err25 = { instancePath: instancePath + "/reason", schemaPath: "#/definitions/TriggerActionPermissionReply/properties/reason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err25];
            } else {
              vErrors.push(err25);
            }
            errors++;
          }
        }
      } else {
        const err26 = { instancePath, schemaPath: "#/definitions/TriggerActionPermissionReply/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err26];
        } else {
          vErrors.push(err26);
        }
        errors++;
      }
      validate10.errors = vErrors;
      return errors === 0;
    }
  }
});
export default require_TriggerActionPermissionReply_validator();
