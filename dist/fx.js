// Mesh vertices are offsets in a basis fixed when the user places an anchor.
// A 3D projection uses the current camera. A 2D track translates a flat stamp.
globalThis.FX = (() => {
  const state = {effect:'portal', tracking:'3d', title:'BEYOND', size:1};
  const tau = Math.PI * 2;
  const effects = [
    ['portal','Glowing portal'],['planet','Floating planet'],['title','3D text'],
    ['city','Miniature city']
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

  function dot(a,b){return a.reduce((sum,v,i)=>sum+v*b[i],0);}
  function normal(a,b,c) {
    const u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);
    const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    const length=Math.hypot(...n)||1;return n.map(x=>x/length);
  }
  function shade(hue,saturation,light){return 'hsl('+hue+' '+saturation+'% '+light+'%)';}
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
    function planet() {
      const p=(i,j)=>{
        const lon=tau*i/32,lat=Math.PI*(j/16-.5),r=.75;
        return [r*Math.cos(lat)*Math.cos(lon),r*Math.sin(lat)+.33,r*Math.cos(lat)*Math.sin(lon)];
      };
      for(let i=0;i<32;i++) for(let j=0;j<16;j++){
        const a=p(i,j),b=p(i+1,j),c=p(i+1,j+1),d=p(i,j+1);
        const light=dot(normal(a,d,b),[-.42,.71,-.56]);
        const bands=Math.sin(j*1.95+.55*Math.sin(i*tau/32+time*.55));
        polygon([a,b,c,d],shade(27+bands*6,61,43+20*light+8*bands));
      }
      for(let i=0;i<64;i++){
        const at=(k,r)=>[r*Math.cos(tau*k/64),.33+r*.27*Math.cos(tau*k/64)+.26*r*Math.sin(tau*k/64),r*Math.sin(tau*k/64)];
        polygon([at(i,.94),at(i+1,.94),at(i+1,1.20),at(i,1.20)],'rgba(255,218,154,.8)');
      }
    }
    function box(x,z,w,h,d){
      const p=(i,j,k)=>[x+w*i,h*j,z+d*k];
      polygon([p(0,1,0),p(1,1,0),p(1,1,1),p(0,1,1)],'#91f6ed');
      polygon([p(0,0,0),p(1,0,0),p(1,1,0),p(0,1,0)],'#247583','#71b9c1');
      polygon([p(0,0,1),p(1,0,1),p(1,1,1),p(0,1,1)],'#21505e');
      for(const i of [0,1])polygon([p(i,0,0),p(i,0,1),p(i,1,1),p(i,1,0)],i?'#215764':'#48929d');
    }
    function city(){
      polygon([[-1,0,-.75],[1,0,-.75],[1,0,.75],[-1,0,.75]],'#18434d','#9defef');
      for(let i=0;i<5;i++)for(let j=0;j<4;j++){
        const n=(i*37+j*17+i*j*5)%19, height=.17+n*.052;
        box(-.88+.37*i,-.62+.31*j,.23,height*(.92+.08*Math.sin(time*2+n)),.20);
      }
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
      else if(state.effect==='planet')planet();
      else if(state.effect==='city')city();
      else if(state.effect==='title')title();
      flush();
    } finally {ctx.restore();}
  }
  let titleImage;
  return {init,draw,get tracking(){return state.tracking;},get effect(){return state.effect;}};
})();
