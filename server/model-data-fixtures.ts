import type { DatasetInput, ProfileInput } from '../shared/model-data.ts';

/** Authored property/box fixtures; these are not customer models or measured site conditions. */
export function sampleModelDataset(): DatasetInput {
  return {
    schema_version: 'forma-retrace.model-data/1',
    title: 'Northbank · coordinated model metadata · synthetic',
    data_mode: 'synthetic',
    source_description: 'Authored synthetic architectural/MEP/structural property extracts for workflow validation. Values and bounding boxes are illustrative, not surveyed or validated model geometry.',
    models: [
      { model_key: 'architecture', project_id: 'fixture-project', project_name: 'Northbank Research Center', model_id: 'fixture-architectural-model', model_name: 'Architectural room reference', version_id: 'arch-v4', format: 'Synthetic property extract', designation: 'for_record', designation_basis: 'Synthetic demonstration designation only.', length_unit: 'm', transform_validation: 'unverified' },
      { model_key: 'mechanical', project_id: 'fixture-project', project_name: 'Northbank Research Center', model_id: 'fixture-mechanical-model', model_name: 'Mechanical equipment coordination', version_id: 'mep-v7', format: 'Synthetic property extract', designation: 'as_built', designation_basis: 'Synthetic demonstration label; no physical As-Built verification.', length_unit: 'mm', transform_validation: 'unverified' },
      { model_key: 'structure', project_id: 'fixture-project', project_name: 'Northbank Research Center', model_id: 'fixture-structural-model', model_name: 'Foundations', version_id: 'structure-v3', format: 'Synthetic property extract', designation: 'unverified', designation_basis: 'Illustrative source, no construction acceptance.', length_unit: 'm', transform_validation: 'unverified' },
    ],
    rooms: [
      { model_key: 'architecture', room_id: 'ROOM-201', name: 'Plant room 201', kind: 'room', bounds: { min: [0,0,0], max: [5,5,4] } },
      { model_key: 'architecture', room_id: 'ROOM-202', name: 'Laboratory 202', kind: 'room', bounds: { min: [5,0,0], max: [10,5,4] } },
      { model_key: 'architecture', room_id: 'ROOM-203', name: 'Service corridor 203', kind: 'room', bounds: { min: [0,5,0], max: [10,7,4] } },
    ],
    elements: [
      { model_key:'mechanical',external_id:'AHU-01',db_id:101,name:'AHU-01 · supply air handling unit',category:'Air Handling Units',family:'Synthetic AHU',type:'Supply',level:'Level 02',physical_asset_id:'fixture-ahu-01',properties:{Manufacturer:{value:'Illustrative Air Systems'},Model:{value:'Demo-S1500'},Airflow:{value:1500,unit:'L/s'},Power:{value:7.5,unit:'kW'},Pressure:{value:450,unit:'Pa'}},bounds:{min:[1000,1000,0],max:[3000,3000,2500]} },
      { model_key:'mechanical',external_id:'AHU-02',db_id:102,name:'AHU-02 · exhaust unit',category:'Air Handling Units',family:'Synthetic AHU',type:'Exhaust',level:'Level 02',physical_asset_id:'fixture-ahu-02',properties:{Manufacturer:{value:'Illustrative Air Systems'},Model:{value:'Demo-E900'},Airflow:{value:null,unit:'L/s'},Power:{value:'11',unit:'kW'},Pressure:{value:0,unit:'Pa'}},bounds:{min:[4500,1000,0],max:[6500,3000,2500]} },
      { model_key:'mechanical',external_id:'DUCT-01',db_id:103,name:'Main supply duct',category:'Ducts',family:'Rectangular duct',type:'Supply',level:'Level 02',properties:{Length:{value:6400,unit:'mm'},Width:{value:800,unit:'mm'},Height:{value:500,unit:'mm'}},bounds:{min:[1000,1000,2800],max:[7400,1800,3300]} },
      { model_key:'mechanical',external_id:'DUCT-02',db_id:104,name:'Unlocated branch duct',category:'Ducts',family:'Rectangular duct',type:'Branch',level:'Level 02',properties:{Length:{value:3,unit:'m'},Width:{value:0.6,unit:'m'},Height:{value:0.3,unit:'m'}} },
      { model_key:'structure',external_id:'FOUNDATION-01',db_id:201,name:'Foundation F-01',category:'Structural Foundations',family:'Pad footing',type:'F-01',level:'Level 01',properties:{Volume:{value:2.4,unit:'m3'},'Formwork Area':{value:8.8,unit:'m2'},Length:{value:2,unit:'m'},Width:{value:2,unit:'m'}},bounds:{min:[1,1,-0.6],max:[3,3,0]} },
      { model_key:'structure',external_id:'FOUNDATION-02',db_id:202,name:'Foundation F-02 · unit exception',category:'Structural Foundations',family:'Pad footing',type:'F-02',level:'Level 01',properties:{Volume:{value:2400,unit:'unknown'},'Formwork Area':{value:null,unit:'m2'},Length:{value:2000,unit:'mm'},Width:{value:2000,unit:'mm'}},bounds:{min:[6,1,-0.6],max:[8,3,0]} },
    ],
  };
}

export function sampleModelProfile(): ProfileInput {
  return {
    name:'Equipment and trade outputs · synthetic review profile',category:'*',
    fields:[
      {key:'manufacturer',label:'Manufacturer',source_names:['Manufacturer'],type:'text',required:true,category:'Air Handling Units'},
      {key:'model',label:'Equipment model',source_names:['Model'],type:'text',required:true,category:'Air Handling Units'},
      {key:'airflow',label:'Design airflow',source_names:['Airflow'],type:'number',unit:'m3/s',required:true,category:'Air Handling Units'},
      {key:'power',label:'Design power',source_names:['Power'],type:'number',unit:'W',required:true,category:'Air Handling Units'},
      {key:'pressure',label:'Design pressure',source_names:['Pressure'],type:'number',unit:'Pa',required:true,category:'Air Handling Units'},
      {key:'length',label:'Authored length',source_names:['Length'],type:'number',unit:'m',required:false},
      {key:'width',label:'Authored width',source_names:['Width'],type:'number',unit:'m',required:false},
      {key:'height',label:'Authored height',source_names:['Height'],type:'number',unit:'m',required:false},
      {key:'volume',label:'Authored concrete volume',source_names:['Volume'],type:'number',unit:'m3',required:true,category:'Structural Foundations'},
      {key:'formwork',label:'Authored formwork-area property',source_names:['Formwork Area'],type:'number',unit:'m2',required:true,category:'Structural Foundations'},
    ],
    classification_rules:[
      {rule_id:'equipment',system_id:'Demo trade packages',system_version:'2026.1',code:'MECH-EQUIPMENT',label:'Mechanical equipment',category:'Air Handling Units',operator:'equals',value:'Air Handling Units'},
      {rule_id:'asset',system_id:'Demo asset taxonomy',system_version:'1',code:'AIR-HANDLING',label:'Air handling asset',category:'Air Handling Units',operator:'equals',value:'Air Handling Units'},
      {rule_id:'duct',system_id:'Demo trade packages',system_version:'2026.1',code:'DUCTWORK',label:'Ductwork',category:'Ducts',operator:'equals',value:'Ducts'},
      {rule_id:'concrete',system_id:'Demo estimating outputs',system_version:'1',code:'CONCRETE',label:'Foundation concrete',category:'Structural Foundations',operator:'equals',value:'Structural Foundations'},
      {rule_id:'formwork',system_id:'Demo estimating outputs',system_version:'1',code:'FORMWORK',label:'Foundation formwork',category:'Structural Foundations',operator:'equals',value:'Structural Foundations'},
    ],
    metrics:[
      {metric_id:'equipment-count',system_id:'Demo trade packages',code:'MECH-EQUIPMENT',label:'Model equipment count',method:'count',unit:'count',basis:'One unique authored equipment element; not installed quantity.'},
      {metric_id:'airflow',system_id:'Demo asset taxonomy',code:'AIR-HANDLING',label:'Authored airflow',method:'property',property:'airflow',unit:'m3/s',basis:'Normalized source Airflow property; not field performance.',aggregation:'none'},
      {metric_id:'duct-length',system_id:'Demo trade packages',code:'DUCTWORK',label:'Authored duct length',method:'property',property:'length',unit:'m',basis:'Source model Length property; no installation measurement.'},
      {metric_id:'duct-area',system_id:'Demo trade packages',code:'DUCTWORK',label:'Rectangular envelope area formula',method:'formula',formula:'2 * (width + height) * length',unit:'m2',basis:'Illustrative rectangular envelope formula; excludes fittings/openings and requires review.'},
      {metric_id:'concrete-volume',system_id:'Demo estimating outputs',code:'CONCRETE',label:'Authored concrete volume',method:'property',property:'volume',unit:'m3',basis:'Source Volume property from synthetic structural extract.'},
      {metric_id:'formwork-area',system_id:'Demo estimating outputs',code:'FORMWORK',label:'Authored formwork area',method:'property',property:'formwork',unit:'m2',basis:'Explicit source Formwork Area property; not inferred from the element bounding box.'},
    ],
    spatial:{enabled:true,adjacency_tolerance_m:0.15,containment_tolerance_m:0},
  };
}
