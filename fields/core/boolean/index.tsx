import { z } from "zod";
import { Field } from "@/types/field";
import { ViewComponent } from "./view-component";

const schema = (field: Field) => {
  let zodSchema = z.coerce.boolean();

  return zodSchema;
};

const defaultValue = false;
const label = "Boolean";

export { label, schema, defaultValue, ViewComponent };