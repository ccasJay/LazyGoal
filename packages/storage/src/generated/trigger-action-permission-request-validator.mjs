var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// TriggerActionPermissionRequest-validator.cjs
var require_TriggerActionPermissionRequest_validator = __commonJS({
  "TriggerActionPermissionRequest-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.type === void 0) {
          const err0 = { instancePath, schemaPath: "#/definitions/TriggerActionPermissionRequest/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.requestId === void 0) {
          const err1 = { instancePath, schemaPath: "#/definitions/TriggerActionPermissionRequest/required", keyword: "required", params: { missingProperty: "requestId" }, message: "must have required property 'requestId'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.runId === void 0) {
          const err2 = { instancePath, schemaPath: "#/definitions/TriggerActionPermissionRequest/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.actionId === void 0) {
          const err3 = { instancePath, schemaPath: "#/definitions/TriggerActionPermissionRequest/required", keyword: "required", params: { missingProperty: "actionId" }, message: "must have required property 'actionId'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.interactionId === void 0) {
          const err4 = { instancePath, schemaPath: "#/definitions/TriggerActionPermissionRequest/required", keyword: "required", params: { missingProperty: "interactionId" }, message: "must have required property 'interactionId'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data.commitRevision === void 0) {
          const err5 = { instancePath, schemaPath: "#/definitions/TriggerActionPermissionRequest/required", keyword: "required", params: { missingProperty: "commitRevision" }, message: "must have required property 'commitRevision'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "type" || key0 === "requestId" || key0 === "runId" || key0 === "actionId" || key0 === "interactionId" || key0 === "commitRevision")) {
            const err6 = { instancePath, schemaPath: "#/definitions/TriggerActionPermissionRequest/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.type !== void 0) {
          let data0 = data.type;
          if (typeof data0 !== "string") {
            const err7 = { instancePath: instancePath + "/type", schemaPath: "#/definitions/TriggerActionPermissionRequest/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
          if ("action_approval_request" !== data0) {
            const err8 = { instancePath: instancePath + "/type", schemaPath: "#/definitions/TriggerActionPermissionRequest/properties/type/const", keyword: "const", params: { allowedValue: "action_approval_request" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.requestId !== void 0) {
          if (typeof data.requestId !== "string") {
            const err9 = { instancePath: instancePath + "/requestId", schemaPath: "#/definitions/TriggerActionPermissionRequest/properties/requestId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data.runId !== void 0) {
          if (typeof data.runId !== "string") {
            const err10 = { instancePath: instancePath + "/runId", schemaPath: "#/definitions/TriggerActionPermissionRequest/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data.actionId !== void 0) {
          if (typeof data.actionId !== "string") {
            const err11 = { instancePath: instancePath + "/actionId", schemaPath: "#/definitions/TriggerActionPermissionRequest/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
        }
        if (data.interactionId !== void 0) {
          if (typeof data.interactionId !== "string") {
            const err12 = { instancePath: instancePath + "/interactionId", schemaPath: "#/definitions/TriggerActionPermissionRequest/properties/interactionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data.commitRevision !== void 0) {
          let data5 = data.commitRevision;
          if (!(typeof data5 == "number" && isFinite(data5))) {
            const err13 = { instancePath: instancePath + "/commitRevision", schemaPath: "#/definitions/TriggerActionPermissionRequest/properties/commitRevision/type", keyword: "type", params: { type: "number" }, message: "must be number" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        }
      } else {
        const err14 = { instancePath, schemaPath: "#/definitions/TriggerActionPermissionRequest/type", keyword: "type", params: { type: "object" }, message: "must be object" };
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
export default require_TriggerActionPermissionRequest_validator();
