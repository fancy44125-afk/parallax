// Mesh vertices are offsets in a basis fixed when the user places an anchor.
// A 3D projection uses the current camera. A 2D track translates a flat stamp.
globalThis.FX = (() => {
  const state = {effect:'portal', tracking:'3d', title:'BEYOND', size:1};
  const tau = Math.PI * 2;
  const effects = [
    ['portal','Glowing portal'],['title','3D text']
  ];
  function init(container, onChange) {
    container.innerHTML = `<div class="fx-controls">
      <label for="fxPreset">Virtual object</label><select id="fxPreset"></select>
      <div id="fxTitleRow" hidden><label for="fxTitle">Text</label><input id="fxTitle" maxlength="20" value="BEYOND" autocomplete="off"></div>
      <label for="fxTracking">Tracking method</label><select id="fxTracking"><option value="3d">3D camera tracking</option><option value="2d">2D point tracking</option></select>
      <small id="fxMethodHint">The camera projects the object from its anchor in 3D.</small>
      <label for="fxSize">Object size <output id="fxSizeValue">100%</output></label><input type="range" id="fxSize" min="40" max="180" value="100" step="5">
    </div>`;
    const el = id => container.querySelector('#'+id);
    effects.forEach(([value,text])=>el('fxPreset').add(new Option(text,value)));
    function changed() {
      state.effect=el('fxPreset').value;
      state.tracking=el('fxTracking').value;
      state.title=el('fxTitle').value.trim() || 'TEXT';
      state.size=Number(el('fxSize').value)/100;
      el('fxTitleRow').hidden=state.effect!=='title';
      el('fxSizeValue').textContent=el('fxSize').value+'%';
      el('fxMethodHint').textContent=state.tracking==='3d'?
        'The camera projects the object from its anchor in 3D.':
        '2D tracking follows a spot on the screen. Its size and orientation stay fixed.';
      onChange();
    }
    el('fxPreset').onchange=el('fxTracking').onchange=changed;
    el('fxTitle').oninput=el('fxSize').oninput=changed;
  }

  function draw(ctx,adapter) {
    const fixed=state.tracking==='2d', origin=adapter.track;
    if(fixed && !origin) return;
    const size=state.size, time=adapter.time || 0;
    function project(v){
      const [x,y,z]=v.map(n=>n*size);
      if(fixed) {
        // Project once into a canonical view. This same stamp follows the 2D track.
        const factor=8/(8+z);
        return [origin[0]+x*adapter.scale*factor,origin[1]-y*adapter.scale*factor,8+z];
      }
      return adapter.project(x,y,z);
    }
    const surfaces=[];
    function path(pts){
      ctx.beginPath();
      pts.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));
    }
    function polygon(vertices,fill,stroke) {
      const pts=vertices.map(project);
      if(pts.some(p=>!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return;
      surfaces.push({pts,fill,stroke,depth:pts.reduce((s,p)=>s+p[2],0)/pts.length});
    }
    function flush(){
      surfaces.sort((a,b)=>b.depth-a.depth);
      for(const face of surfaces){
        path(face.pts);ctx.closePath();ctx.fillStyle=face.fill;ctx.fill();
        if(face.stroke){ctx.lineWidth=.7;ctx.strokeStyle=face.stroke;ctx.stroke();}
      }
      surfaces.length=0;
    }
    function glowLine(vertices,color,width,closed=false){
      const pts=vertices.map(project);if(pts.some(p=>!p))return;
      path(pts);if(closed)ctx.closePath();ctx.strokeStyle=color;ctx.lineWidth=width;
      ctx.shadowColor=color;ctx.shadowBlur=width*2.5;ctx.stroke();ctx.shadowBlur=0;
    }
    function ring(radius,n=64,z=0){
      return Array.from({length:n},(_,i)=>[.66*radius*Math.cos(tau*i/n),radius*Math.sin(tau*i/n),z]);
    }
    function portal(){
      polygon(ring(1), 'rgba(7,18,47,.83)');flush();
      const center=project([0,0,0]),edge=project([0,1,0]);
      if(!center || !edge) return;
      const pen=Math.max(1,Math.min(6,Math.hypot(edge[0]-center[0],edge[1]-center[1])*.045));
      for(let band=0;band<5;band++){
        const pts=Array.from({length:61},(_,i)=>{
          const a=tau*i/60+time*.7+band*.73, r=.16+.70*i/60;
          return [.66*r*Math.cos(a),r*Math.sin(a),-.015];
        });
        glowLine(pts,band%2?'#5690cd':'#427fa1',pen*.32);
      }
      glowLine(ring(1),'#26cfff',pen*1.8,true);
      glowLine(ring(.98),'#e0ffff',pen*.64,true);
      glowLine(ring(1.07),'#63d4ee',pen*.35,true);
    }
    // Texture an extruded sign with a locally affine map for each half of its face.
    function title() {
      if(!titleImage || titleImage.key!==state.title){
        const canvas=document.createElement('canvas');canvas.width=720;canvas.height=160;
        const c=canvas.getContext('2d');c.font='bold 108px sans-serif';c.textAlign='center';
        c.textBaseline='middle';c.fillStyle='#ceffff';c.fillText(state.title,360,80,690);
        titleImage={key:state.title,canvas};
      }
      const width=1.35, height=.32;
      function face(z,dim){
        const pts=[[-width,height,z],[width,height,z],[width,-height,z],[-width,-height,z]].map(project);
        if(pts.some(p=>!p)) return;
        for(const [a,b,c] of [[0,1,3],[2,3,1]]){
          const o=pts[a],x=pts[b],y=pts[c];ctx.save();
          path([o,x,y]);ctx.closePath();ctx.clip();
          if(a===0)ctx.transform((x[0]-o[0])/720,(x[1]-o[1])/720,(y[0]-o[0])/160,(y[1]-o[1])/160,o[0],o[1]);
          else ctx.transform((o[0]-x[0])/720,(o[1]-x[1])/720,(o[0]-y[0])/160,(o[1]-y[1])/160,x[0]+y[0]-o[0],x[1]+y[1]-o[1]);
          ctx.globalAlpha=dim;ctx.drawImage(titleImage.canvas,0,0);ctx.restore();
        }
      }
      for(let i=5;i>=0;i--)face(i*.024,i?.38:1);
    }
    ctx.save();
    try{
      if(state.effect==='portal')portal();
      else if(state.effect==='title')title();
      flush();
    } finally {ctx.restore();}
  }
  let titleImage;
  return {init,draw,get tracking(){return state.tracking;},get effect(){return state.effect;}};
})();
