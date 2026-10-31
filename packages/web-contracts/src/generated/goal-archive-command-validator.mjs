var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// BrowserGoalArchiveCommand-validator.cjs
var require_BrowserGoalArchiveCommand_validator = __commonJS({
  "BrowserGoalArchiveCommand-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.archived === void 0) {
          const err0 = { instancePath, schemaPath: "#/definitions/BrowserGoalArchiveCommand/required", keyword: "required", params: { missingProperty: "archived" }, message: "must have required property 'archived'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "archived")) {
            const err1 = { instancePath, schemaPath: "#/definitions/BrowserGoalArchiveCommand/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
        }
        if (data.archived !== void 0) {
          if (typeof data.archived !== "boolean") {
            const err2 = { instancePath: instancePath + "/archived", schemaPath: "#/definitions/BrowserGoalArchiveCommand/properties/archived/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
      } else {
        const err3 = { instancePath, schemaPath: "#/definitions/BrowserGoalArchiveCommand/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
      validate10.errors = vErrors;
      return errors === 0;
    }
  }
});
export default require_BrowserGoalArchiveCommand_validator();
