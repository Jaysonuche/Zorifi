const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const window={};
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../zorifi-creator-platform.js'),'utf8'),{window,globalThis:window});
const {projectWorkspaceType,queryProjects,duplicateProject}=window.ZorifiCreatorPlatform;

const projects=[
  {id:'edit-new',name:'Summer campaign',updatedAt:'2026-10-10T12:00:00Z',creatorSettings:{workspaceMode:'video'},clips:[],mediaAssets:[]},
  {id:'music-new',name:'Sunset soundtrack',updatedAt:'2026-10-11T12:00:00Z',creatorSettings:{workspaceMode:'music',musicStudio:{}},clips:[],mediaAssets:[],favorite:true},
  {id:'edit-legacy',name:'City after dark',updatedAt:'2026-10-12T12:00:00Z',clips:[],mediaAssets:[]},
  {id:'music-legacy',name:'City score',updatedAt:'2026-10-13T12:00:00Z',creatorSettings:{musicStudio:{bpm:120}},clips:[],mediaAssets:[]},
  {id:'edit-explicit',name:'Sound design video',updatedAt:'2026-10-14T12:00:00Z',creatorSettings:{workspaceMode:'video',musicStudio:{bpm:100}},clips:[],mediaAssets:[]}
];

test('projects stay in their edit or music workspace, including older saved projects',()=>{
  assert.equal(projectWorkspaceType(projects[0]),'video');
  assert.equal(projectWorkspaceType(projects[1]),'music');
  assert.equal(projectWorkspaceType(projects[2]),'video');
  assert.equal(projectWorkspaceType(projects[3]),'music');
  assert.equal(projectWorkspaceType(projects[4]),'video');
  assert.equal(queryProjects(projects,{workspace:'video'}).map(project=>project.id).join(','),'edit-explicit,edit-legacy,edit-new');
  assert.equal(queryProjects(projects,{workspace:'music'}).map(project=>project.id).join(','),'music-new,music-legacy');
  assert.equal(queryProjects(projects).length,projects.length,'Old callers still see every project');
});

test('search, favorites, and duplication preserve workspace separation',()=>{
  assert.equal(queryProjects(projects,{workspace:'music',search:'City'}).map(project=>project.id).join(','),'music-legacy');
  assert.equal(queryProjects(projects,{workspace:'music',filter:'favorites'}).map(project=>project.id).join(','),'music-new');
  assert.equal(queryProjects(projects,{workspace:'video',search:'City'}).map(project=>project.id).join(','),'edit-legacy');
  const copy=duplicateProject(projects[1]);
  assert.equal(projectWorkspaceType(copy),'music');
  assert.notEqual(copy.id,projects[1].id);
});
