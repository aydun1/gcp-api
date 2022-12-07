export interface CwRow {
  'PreferredNames'?: Array<string>;
  'VendorName'?: string;
  'Tags'?: Array<string>;
  'HasPreferredName'?: boolean;
  'HasDocuments'?: boolean;
  'HasEsds'?: boolean;
  'GeneralNote'?: string;
  'SdsNote'?: string;
  'DocumentId'?: number;
  'InnerGroupingNumber'?: number;
  'IsNormalizedProportion'?: boolean;
  'IsVgdUgdFromLatestDocument'?: boolean;
  'IsSingle'?: boolean;
  'IsUnregisteredProduct'?: boolean;
  'RegulatoryBurden'?: number;
  'QueryDetails'?: Array<string>;
  'DocNo'?: string;
  'IsMolten'?: boolean;
  'IsSolution'?: boolean;
  'IsInPowderedForm'?: boolean;
  'Percentage'?: number;
  'RootMaterialName'?: string;
  'TooltipMaterialName'?: string;
  'RootMaterialId'?: number;
  'HasVgd'?: boolean;
  'HasUgd'?: boolean;
  'IsSubMaterial'?: boolean;
  'IsVendorless'?: boolean;
  'IsHidden'?: boolean;
  'IsCatMaterial'?: boolean;
  'Synonym'?: string;
  'HasRedFlag'?: boolean;
  'HasContainer'?: boolean;
  'MsdsId'?: number;
  'GoldMsdsId'?: number;
  'FolderMaterialId'?: number;
  'Storage'?: number;
  'IsGold'?: boolean;
  'IsVgd'?: boolean;
  'IsUgd'?: boolean;
  'IsExactMatch'?: boolean;
  'GridTrackClass'?: number;
  'Reasoncode'?: string;
  'VGDReasoncode'?: string;
  'FoundBySynonym'?: string;
  'HasAlternativeSds'?: boolean;
  'FoundByPreferredName'?: string;
  'Pressure'?: number;
  'Temperature'?: number;
  'SolidForm'?: number;
  'SpecificGravity'?: number;
  'SpecificGravityInitial'?: number;
  'AvgVolume'?: number;
  'AvgVolumeSum'?: number;
  'AvgVolumeInitial'?: number;
  'AvgVolumeUnit'?: string;
  'AvgUnitSystem'?: number;
  'LicVolume'?: number;
  'LicVolumeSum'?: number;
  'LicVolumeInitial'?: number;
  'LicVolumeUnit'?: string;
  'LicUnitSystem'?: number;
  'LicVolumeDate'?: Date;
  'MaxVolume'?: number;
  'MaxVolumeSum'?: number;
  'MaxVolumeInitial'?: number;
  'MaxVolumeUnit'?: string;
  'MaxUnitSystem'?: number;
  'SumContainersVolume'?: number;
  'FilterID'?: number;
  'CurrentFolderId'?: number;
  'CwNo': string;
  'MaterialId'?: number;
  'MaterialType'?: number;
  'DataSetType'?: number;
  'HCodes'?: string;
  'RCodes'?: string;
  'CAS'?: string;
  'FilteredIngredients'?: Array<string>;
  'Name'?: string;
  'Id'?: number;
  'Rn'?: number;
  'TotalRows'?: number;
  'Dgc'?: string;
  'Dgs1'?: string;
  'Dgs2'?: string;
  'Pkg'?: string;
  'Un'?: string;
  'IsApproved'?: number;
  'ApprovedAgent'?: string;
  'ApprovalRequestDate'?: Date;
  'ApprovalAddDate'?: Date;
  'ApprovalStartDate'?: Date;
  'ApprovalEndDate'?: Date;
  'ApprovalUseBy'?: number;
  'ApprovalUse'?: number;
  'IsRiskAssessed'?: number;
  'IsEditable'?: boolean;
  'FolderId'?: number;
  'State'?: number;
  'HazardRating'?: number;
  'HasGold'?: boolean;
  'CatalogName'?: string;
  'VendorId'?: number;
  'IssueDate': Date;
  'ExtractionDate': Date;
  'Country'?: string;
  'Language'?: string;
  [key: string]: string | undefined | number | boolean | Date | Array<string>;

}