var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// EditFileInput-validator.cjs
var require_EditFileInput_validator = __commonJS({
  "EditFileInput-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.path === void 0) {
          const err0 = { instancePath, schemaPath: "#/definitions/EditFileInput/required", keyword: "required", params: { missingProperty: "path" }, message: "must have required property 'path'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.oldString === void 0) {
          const err1 = { instancePath, schemaPath: "#/definitions/EditFileInput/required", keyword: "required", params: { missingProperty: "oldString" }, message: "must have required property 'oldString'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.newString === void 0) {
          const err2 = { instancePath, schemaPath: "#/definitions/EditFileInput/required", keyword: "required", params: { missingProperty: "newString" }, message: "must have required property 'newString'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "path" || key0 === "oldString" || key0 === "newString")) {
            const err3 = { instancePath, schemaPath: "#/definitions/EditFileInput/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.path !== void 0) {
          if (typeof data.path !== "string") {
            const err4 = { instancePath: instancePath + "/path", schemaPath: "#/definitions/EditFileInput/properties/path/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.oldString !== void 0) {
          if (typeof data.oldString !== "string") {
            const err5 = { instancePath: instancePath + "/oldString", schemaPath: "#/definitions/EditFileInput/properties/oldString/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.newString !== void 0) {
          if (typeof data.newString !== "string") {
            const err6 = { instancePath: instancePath + "/newString", schemaPath: "#/definitions/EditFileInput/properties/newString/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
      } else {
        const err7 = { instancePath, schemaPath: "#/definitions/EditFileInput/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
      validate10.errors = vErrors;
      return errors === 0;
    }
  }
});
export default require_EditFileInput_validator();
