import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Button } from "../ui/button";

import { Checkbox } from "../ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "../ui/field";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Textarea } from "../ui/textarea";

export function AddChangeItemDialog() {
  return (
    <div>
      <Dialog>
        <DialogTrigger>
          <Button>Add Change Item</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you absolutely sure?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete your
              account and remove your data from our servers.
            </DialogDescription>
          </DialogHeader>
          <FieldSet>
            <FieldLegend>Add</FieldLegend>
            <FieldDescription>Add an item to the changelog</FieldDescription>
            <Field>
              <FieldLabel>Project ID</FieldLabel>
              <Input id="projectId" />
            </Field>
            <Field>
              <FieldLabel>CVR ID</FieldLabel>
              <Input id="cvrId" />
            </Field>
            <Field>
              <FieldLabel>Status</FieldLabel>
              <Select defaultValue="">
                <SelectTrigger id="status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="Requested">Requested</SelectItem>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="Approved">Approved</SelectItem>
                    <SelectItem value="Denied">Denied</SelectItem>
                    <SelectItem value="Executed">Executed</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Description</FieldLabel>
              <Textarea id="description"></Textarea>
            </Field>
          </FieldSet>
          <Field orientation="horizontal">
            <Button type="submit">Submit</Button>
            <DialogClose>
              <Button variant="outline" type="button">
                Cancel
              </Button>
            </DialogClose>
          </Field>
        </DialogContent>
      </Dialog>
    </div>
  );
}
