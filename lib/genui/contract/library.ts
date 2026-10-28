import { createLibrary, defineComponent } from "@openuidev/lang-core";

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
} from "./schemas";

const noop = () => null;

const Answer = defineComponent({
  component: noop,
  description: "Short prose answer with source references.",
  name: "Answer",
  props: answerPropsSchema,
});

const SectionStack = defineComponent({
  component: noop,
  description: "Ordered sections for multi-intent results.",
  name: "SectionStack",
  props: sectionStackPropsSchema,
});

const CollectionGrid = defineComponent({
  component: noop,
  description: "Collection or grid of entities.",
  name: "CollectionGrid",
  props: collectionGridPropsSchema,
});

const SearchResults = defineComponent({
  component: noop,
  description: "Search results with optional filters.",
  name: "SearchResults",
  props: searchResultsPropsSchema,
});

const ComparisonView = defineComponent({
  component: noop,
  description: "Side-by-side or tabular comparison.",
  name: "ComparisonView",
  props: comparisonViewPropsSchema,
});

const TimelineView = defineComponent({
  component: noop,
  description: "Chronological timeline.",
  name: "TimelineView",
  props: timelineViewPropsSchema,
});

const DetailView = defineComponent({
  component: noop,
  description: "Detail view for one entity or document.",
  name: "DetailView",
  props: detailViewPropsSchema,
});

const DataExplorer = defineComponent({
  component: noop,
  description: "Metrics and charts exploration.",
  name: "DataExplorer",
  props: dataExplorerPropsSchema,
});

const DocumentationBlock = defineComponent({
  component: noop,
  description: "Documentation with code.",
  name: "DocumentationBlock",
  props: documentationBlockPropsSchema,
});

const InteractiveForm = defineComponent({
  component: noop,
  description: "Form wired to registered actions.",
  name: "InteractiveForm",
  props: interactiveFormPropsSchema,
});

const FilePreview = defineComponent({
  component: noop,
  description: "Embedded file or media preview.",
  name: "FilePreview",
  props: filePreviewPropsSchema,
});

const StatusMessage = defineComponent({
  component: noop,
  description: "Loading, empty, warning, or error.",
  name: "StatusMessage",
  props: statusMessagePropsSchema,
});

const EvidenceQuote = defineComponent({
  component: noop,
  description: "Customer evidence quote with link to source signal.",
  name: "EvidenceQuote",
  props: evidenceQuotePropsSchema,
});

const RankedSignalList = defineComponent({
  component: noop,
  description: "Ordered list of signals with supporter context.",
  name: "RankedSignalList",
  props: rankedSignalListPropsSchema,
});

export const flowGenuiContractLibrary = createLibrary({
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

export const flowGenuiLibraryJsonSchema = () => flowGenuiContractLibrary.toJSONSchema();
