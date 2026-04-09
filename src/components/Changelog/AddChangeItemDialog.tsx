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
import { StatusLookup } from "~/generated/prisma/client";
import { useState } from "react";
import { ChangeLog } from "~/lib/types";
import { RequiredFetcher } from "@tanstack/react-start";

export function AddChangeItemDialog({
  statusLookup,
  onAddLog,
}: {
  statusLookup: StatusLookup[];
  onAddLog: any;
}) {
  const [projectId, setProjectId] = useState("");
  const [cvrId, setCvrId] = useState("");
  const [status, setStatus] = useState("");
  const [description, setDescription] = useState("");

  const onUpdateProjectId = (e: React.ChangeEvent<HTMLInputElement>) => {
    setProjectId(e.target.value);
  };

  const onUpdateCvrId = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCvrId(e.target.value);
  };

  const onUpdateStatus = (status: string) => {
    console.log("Updating Status: ", status);
    setStatus(status);
  };

  const onUpdateDescription = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(e.target.value);
  };

  console.log("STATUS: ", status);

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
                onChange={onUpdateProjectId}
                value={projectId}
              />
            </Field>
            <Field>
              <FieldLabel>CVR ID</FieldLabel>
              <Input id="cvrId" onChange={onUpdateCvrId} value={cvrId} />
            </Field>
            <Field>
              <FieldLabel>Status</FieldLabel>
              <Select defaultValue="" onValueChange={onUpdateStatus}>
                <SelectTrigger id="status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {statusLookup.map((item) => (
                      <SelectItem value={`${item.id}`}>
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
                onChange={onUpdateDescription}
                value={description}
              ></Textarea>
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
