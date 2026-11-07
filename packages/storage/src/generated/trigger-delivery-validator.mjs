var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// TriggerDeliveryFile-validator.cjs
var require_TriggerDeliveryFile_validator = __commonJS({
  "TriggerDeliveryFile-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema12 = { "type": "object", "properties": { "deliveryId": { "type": "string" }, "trigger": { "type": "object", "properties": { "id": { "type": "string" }, "purpose": { "type": "string", "enum": ["work", "permission", "interaction", "cancel", "progress", "lifecycle"] }, "source": { "type": "string", "enum": ["user", "worker", "external", "supervisor"] }, "workerId": { "type": "string" }, "generation": { "type": "string" }, "payload": { "type": "string", "description": "JSON \u7F16\u7801\u7684\u4E8B\u4EF6\u8F7D\u8377\uFF1B\u6D88\u8D39\u7AEF\u4ECD\u987B\u6821\u9A8C\u5176\u5177\u4F53\u534F\u8BAE\u3002" } }, "required": ["id", "purpose", "source", "payload"], "additionalProperties": false }, "goalId": { "type": "string" } }, "required": ["deliveryId", "trigger"], "additionalProperties": false, "description": "\u53EF\u8DE8\u8FDB\u7A0B\u4F20\u9012\u7684 Trigger \u53CA\u5355\u6B21\u6295\u9012\u8EAB\u4EFD\u3002" };
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.deliveryId === void 0) {
          const err0 = { instancePath, schemaPath: "#/definitions/TriggerDeliveryFile/required", keyword: "required", params: { missingProperty: "deliveryId" }, message: "must have required property 'deliveryId'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.trigger === void 0) {
          const err1 = { instancePath, schemaPath: "#/definitions/TriggerDeliveryFile/required", keyword: "required", params: { missingProperty: "trigger" }, message: "must have required property 'trigger'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "deliveryId" || key0 === "trigger" || key0 === "goalId")) {
            const err2 = { instancePath, schemaPath: "#/definitions/TriggerDeliveryFile/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.deliveryId !== void 0) {
          if (typeof data.deliveryId !== "string") {
            const err3 = { instancePath: instancePath + "/deliveryId", schemaPath: "#/definitions/TriggerDeliveryFile/properties/deliveryId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.trigger !== void 0) {
          let data1 = data.trigger;
          if (data1 && typeof data1 == "object" && !Array.isArray(data1)) {
            if (data1.id === void 0) {
              const err4 = { instancePath: instancePath + "/trigger", schemaPath: "#/definitions/TriggerDeliveryFile/properties/trigger/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
              if (vErrors === null) {
                vErrors = [err4];
              } else {
                vErrors.push(err4);
              }
              errors++;
            }
            if (data1.purpose === void 0) {
              const err5 = { instancePath: instancePath + "/trigger", schemaPath: "#/definitions/TriggerDeliveryFile/properties/trigger/required", keyword: "required", params: { missingProperty: "purpose" }, message: "must have required property 'purpose'" };
              if (vErrors === null) {
                vErrors = [err5];
              } else {
                vErrors.push(err5);
              }
              errors++;
            }
            if (data1.source === void 0) {
              const err6 = { instancePath: instancePath + "/trigger", schemaPath: "#/definitions/TriggerDeliveryFile/properties/trigger/required", keyword: "required", params: { missingProperty: "source" }, message: "must have required property 'source'" };
              if (vErrors === null) {
                vErrors = [err6];
              } else {
                vErrors.push(err6);
              }
              errors++;
            }
            if (data1.payload === void 0) {
              const err7 = { instancePath: instancePath + "/trigger", schemaPath: "#/definitions/TriggerDeliveryFile/properties/trigger/required", keyword: "required", params: { missingProperty: "payload" }, message: "must have required property 'payload'" };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
            for (const key1 in data1) {
              if (!(key1 === "id" || key1 === "purpose" || key1 === "source" || key1 === "workerId" || key1 === "generation" || key1 === "payload")) {
                const err8 = { instancePath: instancePath + "/trigger", schemaPath: "#/definitions/TriggerDeliveryFile/properties/trigger/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err8];
                } else {
                  vErrors.push(err8);
                }
                errors++;
              }
            }
            if (data1.id !== void 0) {
              if (typeof data1.id !== "string") {
                const err9 = { instancePath: instancePath + "/trigger/id", schemaPath: "#/definitions/TriggerDeliveryFile/properties/trigger/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err9];
                } else {
                  vErrors.push(err9);
                }
                errors++;
              }
            }
            if (data1.purpose !== void 0) {
              let data3 = data1.purpose;
              if (typeof data3 !== "string") {
                const err10 = { instancePath: instancePath + "/trigger/purpose", schemaPath: "#/definitions/TriggerDeliveryFile/properties/trigger/properties/purpose/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err10];
                } else {
                  vErrors.push(err10);
                }
                errors++;
              }
              if (!(data3 === "work" || data3 === "permission" || data3 === "interaction" || data3 === "cancel" || data3 === "progress" || data3 === "lifecycle")) {
                const err11 = { instancePath: instancePath + "/trigger/purpose", schemaPath: "#/definitions/TriggerDeliveryFile/properties/trigger/properties/purpose/enum", keyword: "enum", params: { allowedValues: schema12.properties.trigger.properties.purpose.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err11];
                } else {
                  vErrors.push(err11);
                }
                errors++;
              }
            }
            if (data1.source !== void 0) {
              let data4 = data1.source;
              if (typeof data4 !== "string") {
                const err12 = { instancePath: instancePath + "/trigger/source", schemaPath: "#/definitions/TriggerDeliveryFile/properties/trigger/properties/source/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err12];
                } else {
                  vErrors.push(err12);
                }
                errors++;
              }
              if (!(data4 === "user" || data4 === "worker" || data4 === "external" || data4 === "supervisor")) {
                const err13 = { instancePath: instancePath + "/trigger/source", schemaPath: "#/definitions/TriggerDeliveryFile/properties/trigger/properties/source/enum", keyword: "enum", params: { allowedValues: schema12.properties.trigger.properties.source.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err13];
                } else {
                  vErrors.push(err13);
                }
                errors++;
              }
            }
            if (data1.workerId !== void 0) {
              if (typeof data1.workerId !== "string") {
                const err14 = { instancePath: instancePath + "/trigger/workerId", schemaPath: "#/definitions/TriggerDeliveryFile/properties/trigger/properties/workerId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err14];
                } else {
                  vErrors.push(err14);
                }
                errors++;
              }
            }
            if (data1.generation !== void 0) {
              if (typeof data1.generation !== "string") {
                const err15 = { instancePath: instancePath + "/trigger/generation", schemaPath: "#/definitions/TriggerDeliveryFile/properties/trigger/properties/generation/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err15];
                } else {
                  vErrors.push(err15);
                }
                errors++;
              }
            }
            if (data1.payload !== void 0) {
              if (typeof data1.payload !== "string") {
                const err16 = { instancePath: instancePath + "/trigger/payload", schemaPath: "#/definitions/TriggerDeliveryFile/properties/trigger/properties/payload/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err16];
                } else {
                  vErrors.push(err16);
                }
                errors++;
              }
            }
          } else {
            const err17 = { instancePath: instancePath + "/trigger", schemaPath: "#/definitions/TriggerDeliveryFile/properties/trigger/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
        }
        if (data.goalId !== void 0) {
          if (typeof data.goalId !== "string") {
            const err18 = { instancePath: instancePath + "/goalId", schemaPath: "#/definitions/TriggerDeliveryFile/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err18];
            } else {
              vErrors.push(err18);
            }
            errors++;
          }
        }
      } else {
        const err19 = { instancePath, schemaPath: "#/definitions/TriggerDeliveryFile/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
        }
        errors++;
      }
      validate10.errors = vErrors;
      return errors === 0;
    }
  }
});
export default require_TriggerDeliveryFile_validator();
