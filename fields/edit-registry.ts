import type { ComponentType } from "react";
import { EditComponent as BooleanEditComponent } from "@/fields/core/boolean/edit-component";
import { EditComponent as CodeEditComponent } from "@/fields/core/code/edit-component";
import { EditComponent as DateEditComponent } from "@/fields/core/date/edit-component";
import { EditComponent as FileEditComponent } from "@/fields/core/file/edit-component";
import { EditComponent as ImageEditComponent } from "@/fields/core/image/edit-component";
import { EditComponent as NumberEditComponent } from "@/fields/core/number/edit-component";
import { EditComponent as ReferenceEditComponent } from "@/fields/core/reference/edit-component";
import { EditComponent as RichTextEditComponent } from "@/fields/core/rich-text/edit-component";
import { EditComponent as SelectEditComponent } from "@/fields/core/select/edit-component";
import { EditComponent as StringEditComponent } from "@/fields/core/string/edit-component";
import { EditComponent as TextEditComponent } from "@/fields/core/text/edit-component";
import { EditComponent as UuidEditComponent } from "@/fields/core/uuid/edit-component";

// The edit components of the fields, used by the entry form only. They are kept
// out of fields/registry.ts, which the collection list imports too (through
// lib/schema.ts): the heavy editors (TipTap, CodeMirror) would be downloaded
// with every page of the app.
const editComponents: Record<string, ComponentType<any>> = {
  "boolean": BooleanEditComponent,
  "code": CodeEditComponent,
  "date": DateEditComponent,
  "file": FileEditComponent,
  "image": ImageEditComponent,
  "number": NumberEditComponent,
  "reference": ReferenceEditComponent,
  "rich-text": RichTextEditComponent,
  "select": SelectEditComponent,
  "string": StringEditComponent,
  "text": TextEditComponent,
  "uuid": UuidEditComponent,
};

export { editComponents };
