import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from "../ui/dialog";
import { Button } from "../ui/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
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
import { StatusLookup } from "~/generated/prisma/client";
import { useState } from "react";
import type { ChangeLog } from "~/lib/types";

type OnAddLog = (log: { data: Omit<ChangeLog, "id"> }) => Promise<unknown>;

export function AddChangeItemDialog({
  statusLookup,
  onAddLog,
}: {
  statusLookup: StatusLookup[];
  onAddLog: OnAddLog;
}) {
  const [projectId, setProjectId] = useState("");
  const [cvrId, setCvrId] = useState("");
  const [status, setStatus] = useState("");
  const [description, setDescription] = useState("");

  return (
    <div>
      <Dialog>
        <DialogTrigger>
          <Button>Add Change Item</Button>
        </DialogTrigger>
        <DialogContent>
          <FieldSet>
            <FieldLegend>Add</FieldLegend>
            <FieldDescription>Add an item to the changelog</FieldDescription>
            <Field>
              <FieldLabel>Project ID</FieldLabel>
              <Input
                id="projectId"
                onChange={(e) => setProjectId(e.target.value)}
                value={projectId}
              />
            </Field>
            <Field>
              <FieldLabel>CVR ID</FieldLabel>
              <Input
                id="cvrId"
                onChange={(e) => setCvrId(e.target.value)}
                value={cvrId}
              />
            </Field>
            <Field>
              <FieldLabel>Status</FieldLabel>
              <Select defaultValue="" onValueChange={setStatus}>
                <SelectTrigger id="status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {statusLookup.map((item) => (
                      <SelectItem key={item.id} value={`${item.id}`}>
                        {item.status}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Description</FieldLabel>
              <Textarea
                id="description"
                onChange={(e) => setDescription(e.target.value)}
                value={description}
              />
            </Field>
          </FieldSet>
          <Field orientation="horizontal">
            <DialogClose>
              <Button
                type="submit"
                onClick={async () =>
                  await onAddLog({
                    data: {
                      projectId: +projectId,
                      cvrId: +cvrId,
                      statusId: +status,
                      description: description,
                      createdAt: new Date(),
                      updatedAt: new Date(),
                    },
                  })
                }
              >
                Submit
              </Button>
            </DialogClose>
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
