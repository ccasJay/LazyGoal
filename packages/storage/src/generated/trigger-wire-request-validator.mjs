var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// TriggerWireRequest-validator.cjs
var require_TriggerWireRequest_validator = __commonJS({
  "TriggerWireRequest-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema13 = { "type": "object", "properties": { "deliveryId": { "type": "string" }, "trigger": { "type": "object", "properties": { "id": { "type": "string" }, "purpose": { "type": "string", "enum": ["work", "permission", "interaction", "cancel", "progress", "lifecycle"] }, "source": { "type": "string", "enum": ["user", "worker", "external", "supervisor"] }, "workerId": { "type": "string" }, "generation": { "type": "string" }, "payload": { "type": "string", "description": "JSON \u7F16\u7801\u7684\u4E8B\u4EF6\u8F7D\u8377\uFF1B\u6D88\u8D39\u7AEF\u4ECD\u987B\u6821\u9A8C\u5176\u5177\u4F53\u534F\u8BAE\u3002" } }, "required": ["id", "purpose", "source", "payload"], "additionalProperties": false }, "goalId": { "type": "string" } }, "required": ["deliveryId", "trigger"], "additionalProperties": false, "description": "\u53EF\u8DE8\u8FDB\u7A0B\u4F20\u9012\u7684 Trigger \u53CA\u5355\u6B21\u6295\u9012\u8EAB\u4EFD\u3002" };
    function validate11(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.secret === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "secret" }, message: "must have required property 'secret'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.delivery === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "delivery" }, message: "must have required property 'delivery'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "secret" || key0 === "delivery")) {
            const err2 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.secret !== void 0) {
          if (typeof data.secret !== "string") {
            const err3 = { instancePath: instancePath + "/secret", schemaPath: "#/properties/secret/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.delivery !== void 0) {
          let data1 = data.delivery;
          if (data1 && typeof data1 == "object" && !Array.isArray(data1)) {
            if (data1.deliveryId === void 0) {
              const err4 = { instancePath: instancePath + "/delivery", schemaPath: "#/definitions/TriggerDeliveryFile/required", keyword: "required", params: { missingProperty: "deliveryId" }, message: "must have required property 'deliveryId'" };
              if (vErrors === null) {
                vErrors = [err4];
              } else {
                vErrors.push(err4);
              }
              errors++;
            }
            if (data1.trigger === void 0) {
              const err5 = { instancePath: instancePath + "/delivery", schemaPath: "#/definitions/TriggerDeliveryFile/required", keyword: "required", params: { missingProperty: "trigger" }, message: "must have required property 'trigger'" };
              if (vErrors === null) {
                vErrors = [err5];
              } else {
                vErrors.push(err5);
              }
              errors++;
            }
            for (const key1 in data1) {
              if (!(key1 === "deliveryId" || key1 === "trigger" || key1 === "goalId")) {
                const err6 = { instancePath: instancePath + "/delivery", schemaPath: "#/definitions/TriggerDeliveryFile/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err6];
                } else {
                  vErrors.push(err6);
                }
                errors++;
              }
            }
            if (data1.deliveryId !== void 0) {
              if (typeof data1.deliveryId !== "string") {
                const err7 = { instancePath: instancePath + "/delivery/deliveryId", schemaPath: "#/definitions/TriggerDeliveryFile/properties/deliveryId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err7];
                } else {
                  vErrors.push(err7);
                }
                errors++;
              }
            }
            if (data1.trigger !== void 0) {
              let data3 = data1.trigger;
              if (data3 && typeof data3 == "object" && !Array.isArray(data3)) {
                if (data3.id === void 0) {
                  const err8 = { instancePath: instancePath + "/delivery/trigger", schemaPath: "#/definitions/TriggerDeliveryFile/properties/trigger/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
                  if (vErrors === null) {
                    vErrors = [err8];
                  } else {
                    vErrors.push(err8);
                  }
                  errors++;
                }
                if (data3.purpose === void 0) {
                  const err9 = { instancePath: instancePath + "/delivery/trigger", schemaPath: "#/definitions/TriggerDeliveryFile/properties/trigger/required", keyword: "required", params: { missingProperty: "purpose" }, message: "must have required property 'purpose'" };
                  if (vErrors === null) {
                    vErrors = [err9];
                  } else {
                    vErrors.push(err9);
                  }
                  errors++;
                }
                if (data3.source === void 0) {
                  const err10 = { instancePath: instancePath + "/delivery/trigger", schemaPath: "#/definitions/TriggerDeliveryFile/properties/trigger/required", keyword: "required", params: { missingProperty: "source" }, message: "must have required property 'source'" };
                  if (vErrors === null) {
                    vErrors = [err10];
                  } else {
                    vErrors.push(err10);
                  }
                  errors++;
                }
                if (data3.payload === void 0) {
                  const err11 = { instancePath: instancePath + "/delivery/trigger", schemaPath: "#/definitions/TriggerDeliveryFile/properties/trigger/required", keyword: "required", params: { missingProperty: "payload" }, message: "must have required property 'payload'" };
                  if (vErrors === null) {
                    vErrors = [err11];
                  } else {
                    vErrors.push(err11);
                  }
                  errors++;
                }
                for (const key2 in data3) {
                  if (!(key2 === "id" || key2 === "purpose" || key2 === "source" || key2 === "workerId" || key2 === "generation" || key2 === "payload")) {
                    const err12 = { instancePath: instancePath + "/delivery/trigger", schemaPath: "#/definitions/TriggerDeliveryFile/properties/trigger/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err12];
                    } else {
                      vErrors.push(err12);
                    }
                    errors++;
                  }
                }
                if (data3.id !== void 0) {
                  if (typeof data3.id !== "string") {
                    const err13 = { instancePath: instancePath + "/delivery/trigger/id", schemaPath: "#/definitions/TriggerDeliveryFile/properties/trigger/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err13];
                    } else {
                      vErrors.push(err13);
                    }
                    errors++;
                  }
                }
                if (data3.purpose !== void 0) {
                  let data5 = data3.purpose;
                  if (typeof data5 !== "string") {
                    const err14 = { instancePath: instancePath + "/delivery/trigger/purpose", schemaPath: "#/definitions/TriggerDeliveryFile/properties/trigger/properties/purpose/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err14];
                    } else {
                      vErrors.push(err14);
                    }
                    errors++;
                  }
                  if (!(data5 === "work" || data5 === "permission" || data5 === "interaction" || data5 === "cancel" || data5 === "progress" || data5 === "lifecycle")) {
                    const err15 = { instancePath: instancePath + "/delivery/trigger/purpose", schemaPath: "#/definitions/TriggerDeliveryFile/properties/trigger/properties/purpose/enum", keyword: "enum", params: { allowedValues: schema13.properties.trigger.properties.purpose.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err15];
                    } else {
                      vErrors.push(err15);
                    }
                    errors++;
                  }
                }
                if (data3.source !== void 0) {
                  let data6 = data3.source;
                  if (typeof data6 !== "string") {
                    const err16 = { instancePath: instancePath + "/delivery/trigger/source", schemaPath: "#/definitions/TriggerDeliveryFile/properties/trigger/properties/source/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err16];
                    } else {
                      vErrors.push(err16);
                    }
                    errors++;
                  }
                  if (!(data6 === "user" || data6 === "worker" || data6 === "external" || data6 === "supervisor")) {
                    const err17 = { instancePath: instancePath + "/delivery/trigger/source", schemaPath: "#/definitions/TriggerDeliveryFile/properties/trigger/properties/source/enum", keyword: "enum", params: { allowedValues: schema13.properties.trigger.properties.source.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err17];
                    } else {
                      vErrors.push(err17);
                    }
                    errors++;
                  }
                }
                if (data3.workerId !== void 0) {
                  if (typeof data3.workerId !== "string") {
                    const err18 = { instancePath: instancePath + "/delivery/trigger/workerId", schemaPath: "#/definitions/TriggerDeliveryFile/properties/trigger/properties/workerId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err18];
                    } else {
                      vErrors.push(err18);
                    }
                    errors++;
                  }
                }
                if (data3.generation !== void 0) {
                  if (typeof data3.generation !== "string") {
                    const err19 = { instancePath: instancePath + "/delivery/trigger/generation", schemaPath: "#/definitions/TriggerDeliveryFile/properties/trigger/properties/generation/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err19];
                    } else {
                      vErrors.push(err19);
                    }
                    errors++;
                  }
                }
                if (data3.payload !== void 0) {
                  if (typeof data3.payload !== "string") {
                    const err20 = { instancePath: instancePath + "/delivery/trigger/payload", schemaPath: "#/definitions/TriggerDeliveryFile/properties/trigger/properties/payload/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err20];
                    } else {
                      vErrors.push(err20);
                    }
                    errors++;
                  }
                }
              } else {
                const err21 = { instancePath: instancePath + "/delivery/trigger", schemaPath: "#/definitions/TriggerDeliveryFile/properties/trigger/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err21];
                } else {
                  vErrors.push(err21);
                }
                errors++;
              }
            }
            if (data1.goalId !== void 0) {
              if (typeof data1.goalId !== "string") {
                const err22 = { instancePath: instancePath + "/delivery/goalId", schemaPath: "#/definitions/TriggerDeliveryFile/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err22];
                } else {
                  vErrors.push(err22);
                }
                errors++;
              }
            }
          } else {
            const err23 = { instancePath: instancePath + "/delivery", schemaPath: "#/definitions/TriggerDeliveryFile/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err23];
            } else {
              vErrors.push(err23);
            }
            errors++;
          }
        }
      } else {
        const err24 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err24];
        } else {
          vErrors.push(err24);
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
export default require_TriggerWireRequest_validator();
