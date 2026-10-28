"use client";

import { createLibrary, defineComponent, useRenderNode } from "@openuidev/react-lang";
import type { z } from "zod";

import {
  answerPropsSchema,
  collectionGridPropsSchema,
  comparisonViewPropsSchema,
  dataExplorerPropsSchema,
  detailViewPropsSchema,
  documentationBlockPropsSchema,
  filePreviewPropsSchema,
  interactiveFormPropsSchema,
  searchResultsPropsSchema,
  sectionStackPropsSchema,
  statusMessagePropsSchema,
  timelineViewPropsSchema,
  evidenceQuotePropsSchema,
  rankedSignalListPropsSchema,
} from "../contract/schemas";
import { useGenuiRecords } from "./record-context";
import {
  AnswerView,
  CollectionGridView,
  ComparisonViewUi,
  DataExplorerView,
  DetailViewUi,
  DocumentationBlockView,
  FilePreviewView,
  InteractiveFormView,
  SearchResultsView,
  StatusMessageView,
  TimelineViewUi,
  EvidenceQuoteView,
  RankedSignalListView,
} from "./views";

const AnswerComponent = ({ props }: { props: z.infer<typeof answerPropsSchema> }) => {
  const records = useGenuiRecords();
  return <AnswerView body={props.body} records={records} sourceIds={props.sourceIds} />;
};

const CollectionGridComponent = ({
  props,
}: {
  props: z.infer<typeof collectionGridPropsSchema>;
}) => {
  const records = useGenuiRecords();
  return (
    <CollectionGridView composite={props.composite} entityIds={props.entityIds} records={records} />
  );
};

const SearchResultsComponent = ({ props }: { props: z.infer<typeof searchResultsPropsSchema> }) => {
  const records = useGenuiRecords();
  return (
    <SearchResultsView
      composite={props.composite}
      entityIds={props.entityIds}
      query={props.query}
      records={records}
    />
  );
};

const ComparisonViewComponent = ({
  props,
}: {
  props: z.infer<typeof comparisonViewPropsSchema>;
}) => {
  const records = useGenuiRecords();
  return <ComparisonViewUi entityIds={props.entityIds} records={records} />;
};

const DataExplorerComponent = ({ props }: { props: z.infer<typeof dataExplorerPropsSchema> }) => {
  const records = useGenuiRecords();
  return <DataExplorerView metricIds={props.metricIds} records={records} />;
};

const TimelineViewComponent = ({ props }: { props: z.infer<typeof timelineViewPropsSchema> }) => {
  const records = useGenuiRecords();
  return <TimelineViewUi orderedIds={props.orderedIds} records={records} />;
};

const DetailViewComponent = ({ props }: { props: z.infer<typeof detailViewPropsSchema> }) => {
  const records = useGenuiRecords();
  return <DetailViewUi composite={props.composite} records={records} sourceId={props.sourceId} />;
};

const DocumentationBlockComponent = ({
  props,
}: {
  props: z.infer<typeof documentationBlockPropsSchema>;
}) => {
  const records = useGenuiRecords();
  return (
    <DocumentationBlockView
      composite={props.composite}
      documentId={props.documentId}
      records={records}
    />
  );
};

const FilePreviewComponent = ({ props }: { props: z.infer<typeof filePreviewPropsSchema> }) => {
  const records = useGenuiRecords();
  return <FilePreviewView composite={props.composite} mediaId={props.mediaId} records={records} />;
};

const InteractiveFormComponent = ({
  props,
}: {
  props: z.infer<typeof interactiveFormPropsSchema>;
}) => <InteractiveFormView composite={props.composite} formId={props.formId} />;

const StatusMessageComponent = ({ props }: { props: z.infer<typeof statusMessagePropsSchema> }) => (
  <StatusMessageView message={props.message} variant={props.variant} />
);

const SectionStackComponent = ({ props }: { props: z.infer<typeof sectionStackPropsSchema> }) => {
  const renderNode = useRenderNode();
  const children = Array.isArray(props.children) ? props.children : [];
  return (
    <div className="flex flex-col gap-8">
      {children.map((child, index) => (
        <div key={`section-${index}`}>{renderNode(child)}</div>
      ))}
    </div>
  );
};

const Answer = defineComponent({
  component: AnswerComponent,
  description: "Short prose answer with source references.",
  name: "Answer",
  props: answerPropsSchema,
});

const SectionStack = defineComponent({
  component: SectionStackComponent,
  description: "Section stack.",
  name: "SectionStack",
  props: sectionStackPropsSchema,
});

const CollectionGrid = defineComponent({
  component: CollectionGridComponent,
  description: "Collection grid.",
  name: "CollectionGrid",
  props: collectionGridPropsSchema,
});

const SearchResults = defineComponent({
  component: SearchResultsComponent,
  description: "Search results with optional filters.",
  name: "SearchResults",
  props: searchResultsPropsSchema,
});

const ComparisonView = defineComponent({
  component: ComparisonViewComponent,
  description: "Comparison view.",
  name: "ComparisonView",
  props: comparisonViewPropsSchema,
});

const DataExplorer = defineComponent({
  component: DataExplorerComponent,
  description: "Metrics explorer.",
  name: "DataExplorer",
  props: dataExplorerPropsSchema,
});

const TimelineView = defineComponent({
  component: TimelineViewComponent,
  description: "Timeline.",
  name: "TimelineView",
  props: timelineViewPropsSchema,
});

const DetailView = defineComponent({
  component: DetailViewComponent,
  description: "Detail view for one entity or document.",
  name: "DetailView",
  props: detailViewPropsSchema,
});

const DocumentationBlock = defineComponent({
  component: DocumentationBlockComponent,
  description: "Documentation with code.",
  name: "DocumentationBlock",
  props: documentationBlockPropsSchema,
});

const InteractiveForm = defineComponent({
  component: InteractiveFormComponent,
  description: "Form wired to registered actions.",
  name: "InteractiveForm",
  props: interactiveFormPropsSchema,
});

const FilePreview = defineComponent({
  component: FilePreviewComponent,
  description: "Embedded file or media preview.",
  name: "FilePreview",
  props: filePreviewPropsSchema,
});

const StatusMessage = defineComponent({
  component: StatusMessageComponent,
  description: "Status message.",
  name: "StatusMessage",
  props: statusMessagePropsSchema,
});

const EvidenceQuoteComponent = ({ props }: { props: z.infer<typeof evidenceQuotePropsSchema> }) => {
  const records = useGenuiRecords();
  return <EvidenceQuoteView documentId={props.documentId} records={records} />;
};

const RankedSignalListComponent = ({
  props,
}: {
  props: z.infer<typeof rankedSignalListPropsSchema>;
}) => {
  const records = useGenuiRecords();
  return (
    <RankedSignalListView
      entityIds={props.entityIds}
      records={records}
      reviewHref={props.reviewHref}
    />
  );
};

const EvidenceQuote = defineComponent({
  component: EvidenceQuoteComponent,
  description: "Evidence quote.",
  name: "EvidenceQuote",
  props: evidenceQuotePropsSchema,
});

const RankedSignalList = defineComponent({
  component: RankedSignalListComponent,
  description: "Ranked signal list.",
  name: "RankedSignalList",
  props: rankedSignalListPropsSchema,
});

export const flowGenuiReactLibrary = createLibrary({
  components: [
    Answer,
    SectionStack,
    CollectionGrid,
    SearchResults,
    ComparisonView,
    TimelineView,
    DetailView,
    DataExplorer,
    DocumentationBlock,
    InteractiveForm,
    FilePreview,
    StatusMessage,
    EvidenceQuote,
    RankedSignalList,
  ],
  root: "Answer",
});
