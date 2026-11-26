// Two controlled inverse-geometry experiments. All distances are in scene units.
globalThis.BreakLab = (() => {
  const roomW = 320, roomH = 192, roomF = 265;
  // A gallery formed from painted, axis-aligned surfaces. Define it once in
  // model coordinates; a scaled version puts every visible surface farther away.
  const boxes = [
    [[-4,-1.65,0],[4,-1.6,12],[108,98,88]],
    [[-4,2.8,0],[4,2.85,12],[95,90,86]],
    [[-4,-1.6,0],[-3.95,2.8,12],[149,113,92]],
    [[3.95,-1.6,0],[4,2.8,12],[108,113,107]],
    [[-4,-1.6,11.9],[4,2.8,12],[160,140,119]],
    [[-2.4,-1.6,5.8],[-1.28,-.16,7],[177,152,126]],
    [[-2.19,-.16,6.02],[-1.5,.94,6.76],[162,92,65]],
    [[.6,-1.6,8.6],[2.22,-.52,9.9],[159,142,118]],
    [[.9,-.52,8.93],[1.91,.76,9.57],[77,132,128]],
    [[-.93,-.62,11.66],[1.42,1.84,11.78],[65,59,55]],
    [[-.8,-.49,11.55],[1.29,1.71,11.64],[196,159,118]]
  ];
  function roomFrame(canvas,k,amount,scaleTravel) {
    const ctx=canvas.getContext('2d'), img=ctx.createImageData(roomW,roomH);
    const angle=amount*Math.PI/180*(scaleTravel ? 1 : 1/k);
    const c=Math.cos(angle), s=Math.sin(angle);
    const origin=[-7*s,0,7*(1-c)];
    for(let v=0;v<roomH;v++) for(let u=0;u<roomW;u++) {
      const x=(u+.5-roomW/2)/roomF, y=(roomH/2-v-.5)/roomF;
      const ray=[x*c+s,y,c-x*s];
      let nearest=Infinity, hit=-1, axis=0;
      for(let n=0;n<boxes.length;n++) {
        const [min,max]=boxes[n];
        let enter=-Infinity, leave=Infinity, side=0;
        for(let j=0;j<3;j++) {
          if(Math.abs(ray[j])<1e-9) {if(origin[j]<min[j] || origin[j]>max[j])leave=-Infinity;continue;}
          const a=(min[j]-origin[j])/ray[j], b=(max[j]-origin[j])/ray[j];
          const lo=Math.min(a,b);if(lo>enter){enter=lo;side=j;}
          leave=Math.min(leave,Math.max(a,b));
        }
        if(enter>0 && enter<=leave && enter<nearest){hit=n;nearest=enter;axis=side;}
      }
      const index=4*(v*roomW+u);
      let color=[28,38,41], shade=1;
      if(hit>=0) {
        color=boxes[hit][2];
        const px=origin[0]+ray[0]*nearest,py=ray[1]*nearest,pz=origin[2]+ray[2]*nearest;
        shade=axis===0?.83:axis===1?1.06:1;
        // Tiles, a row of ceiling lights, and a print identify matching features.
        if(hit===0) shade*=Math.min(Math.abs(px-Math.round(px)),Math.abs(pz-Math.round(pz)))<.015?.62:1;
        if(hit===1 && Math.abs(px)<.09 && Math.cos(pz*1.7)>.1)color=[220,215,192];
        if(hit===10 && (py<.22*Math.cos(px*5)+.3 || Math.hypot(px-.5,py-1.05)<.28))
          color=py>.65?[225,202,142]:[87,107,101];
      }
      for(let c=0;c<3;c++)img.data[index+c]=color[c]*shade;
      img.data[index+3]=255;
    }
    ctx.putImageData(img,0,0);
    return img;
  }

  const width=280,height=168,focal=245;
  function hash(x,y,seed=0) {
    let n=Math.imul(x,374761393)+Math.imul(y,668265263)+seed;
    n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;
  }
  // The reference depth map is kept outside the solver. Every pixel belongs to
  // a visible plane with analytic Z, so even a wrong correspondence is scored.
  function benchFrame(settings,second) {
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d'),img=ctx.createImageData(width,height);
    const truth=new Float32Array(width*height);
    const angle=(second?settings.travel:0)*Math.PI/180;
    const c=Math.cos(angle), s=Math.sin(angle);
    const eye={x:-7*s,y:0,z:7*(1-c),yaw:angle};
    const planes=[{z:4.3,x:-.8,y:-.33,w:1.22,h:1.35,color:[151,103,77],moving:true},
      {z:6.8,x:1.15,y:.11,w:1.9,h:1.96,color:[81,130,127]},
      {z:10,x:0,y:0,w:80,h:80,color:[120,117,109]}];
    for(let v=0,i=0;v<height;v++) for(let u=0;u<width;u++,i++) {
      const dx=(u-width/2)/focal,dy=(height*.58-v)/focal;
      for(const p of planes) {
        const distance=(p.z-eye.z)/(c-dx*s);
        const x=eye.x+(dx*c+s)*distance-p.x-(p.moving && second? settings.moving:0), y=dy*distance-p.y;
        if(Math.abs(x)>p.w*.5 || Math.abs(y)>p.h*.5)continue;
        const tx=Math.floor(x*9), ty=Math.floor(y*9);
        const detail=(hash(tx,ty)-.5)*(1-settings.repeat)+(((tx+ty)&1)-.5)*settings.repeat;
        const texture=detail*135*settings.texture;
        const exposure=second?1-settings.light*.72:1;
        const noise=(hash(u,v,second?99883:29117)-.5)*settings.noise*148;
        for(let c=0;c<3;c++)img.data[4*i+c]=(p.color[c]+texture)*exposure+noise;
        img.data[4*i+3]=255;truth[i]=p.z;break;
      }
    }
    return {img,truth,eye};
  }
  function analyze(s) {
    const a=benchFrame(s,false), b=benchFrame(s,true);
    const {points}=Pose.solveCalibrated(a.img,b.img,focal,a.eye,b.eye);
    let squared=0;
    const errors=points.map(p=>{
      const z=a.truth[p.v*width+p.u];
      const residual=Math.hypot(p.x-(p.u-width/2)*z/focal,p.y-(height*.58-p.v)*z/focal,p.z-z);
      squared+=residual*residual;
      return residual;
    });
    return {a,b,points,errors,rmse:points.length?Math.sqrt(squared/points.length):null};
  }
  function slider(name,label,min,max,step,value) {
    return '<label class="bl-slider"><span>'+label+' <output></output></span><input name="'+name+'" type="range" min="'+min+'" max="'+max+'" step="'+step+'" value="'+value+'"></label>';
  }
  function imagePanel(caption,which,w,h) {
    return '<figure><canvas data-image="'+which+'" width="'+w+'" height="'+h+'" aria-label="'+caption+'"></canvas><figcaption>'+caption+'</figcaption></figure>';
  }
  const css=`
.bl-wrap{--bl-edge:#394344;background:#161c1e;color:#e5edec;padding:clamp(14px,2.5vw,32px);border:1px solid var(--bl-edge);border-radius:12px;line-height:1.5}
.bl-wrap *{box-sizing:border-box}.bl-wrap h2,.bl-wrap h3{color:#eef6f4;margin:0}.bl-wrap h2{font-size:clamp(25px,3vw,42px);line-height:1.12}
.bl-wrap p{margin:8px 0 16px;color:#bed0cf;font-size:15px}.bl-tabs{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 20px}.bl-tabs button,.bl-wrap select,.bl-reset{border:1px solid #455555;border-radius:6px;background:#263032;color:#dbe7e5;padding:8px 12px;font:inherit;cursor:pointer}.bl-tabs [aria-pressed=true]{color:#102225;background:#86e9df;border-color:#86e9df}
.bl-images{display:grid;grid-template-columns:1fr 1fr;gap:12px}.bl-images figure{margin:0;background:#0a1012;position:relative;min-width:0;border:1px solid var(--bl-edge);border-radius:6px;overflow:hidden}.bl-images canvas{width:100%;height:auto;display:block}.bl-images figcaption{padding:6px 10px;color:#c8d6d5;font:12px/1.4 ui-monospace,monospace}
.bl-controls{display:flex;align-items:center;gap:20px;flex-wrap:wrap;margin:16px 0}.bl-wrap label{color:#d8e5e3;font-size:14px}.bl-controls select{margin-left:6px}.bl-slider{display:grid;gap:5px;min-width:150px}.bl-slider span{display:flex;justify-content:space-between;gap:12px}.bl-wrap output{color:#8af4e6;font:13px ui-monospace,monospace;letter-spacing:normal;min-width:0}.bl-wrap input{accent-color:#8af4e6}.bl-wrap input[type=range]{width:100%;margin:0}.bl-bench-range{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:15px 24px;margin:18px 0}.bl-status{display:flex;align-items:center;gap:16px;border-top:1px solid var(--bl-edge);padding-top:14px}.bl-status strong{color:#a2f3eb;font:600 16px ui-monospace,monospace;white-space:nowrap}.bl-status p{margin:0}.bl-wrap [hidden]{display:none!important}.bl-wrap button:focus-visible,.bl-wrap select:focus-visible,.bl-wrap input:focus-visible{outline:2px solid #8af4e6;outline-offset:3px}@media(max-width:700px){.bl-bench-range{grid-template-columns:repeat(2,minmax(0,1fr))}.bl-status{align-items:flex-start;flex-direction:column;gap:6px}.bl-controls{gap:10px}.bl-slider{min-width:0}.bl-images{gap:6px}}
`;
  function init(container) {
    if(container.dataset.breakInitialized)return;
    container.dataset.breakInitialized='true';
    container.innerHTML='<style>'+css+'</style><div class="bl-wrap"><div class="bl-tabs"><button aria-pressed="true" data-tab="room">Impossible room</button><button aria-pressed="false" data-tab="bench">Tracking stress test</button></div><section data-pane="room"><h2>The impossible room</h2><p>Which gallery is life-size? Compare a small room with a copy four times larger and farther away. Start with both cameras still, then orbit the center of each gallery.</p><div class="bl-images">'+
      imagePanel('World A · miniature gallery','a',roomW,roomH)+imagePanel('World B · 4× scale','b',roomW,roomH)+'</div><div class="bl-controls">'+
      slider('amount','World A orbit angle',0,20,1,0)+'<label><input type="checkbox" name="scale"> Scale B’s camera travel by 4×</label></div><div class="bl-status"><strong data-room-measure></strong><p data-room-result></p></div></section><section data-pane="bench" hidden><h2>Tracking stress test</h2><p>These three panels sit at known depths. Change the footage and measure how closely the tracker recovers their actual 3D positions.</p><div class="bl-images">'+
      imagePanel('Original frame','first',width,height)+imagePanel('Second frame · dots mark reconstructed corners','second',width,height)+'</div><div class="bl-bench-range">'+
      slider('travel','Orbit angle',0,8,.5,4)+slider('texture','Surface texture',0,100,1,90)+slider('light','Lighting change',0,100,1,0)+slider('repeat','Repeated pattern',0,100,1,0)+slider('moving','Subject drift',0,1,.01,0)+slider('noise','Image noise',0,100,1,0)+'</div><div class="bl-status"><strong data-score aria-live="polite"></strong><p>3D error is the root-mean-square distance from each recovered corner to its true position, in scene units. Cyan dots fall within 0.5 units. Orange dots exceed that distance.</p><button class="bl-reset" type="button">Reset</button></div></section></div>';
    const one=q=>container.querySelector(q),el=n=>one('[name="'+n+'"]');
    function updateRoom(){
      const amount=Number(el('amount').value);
      const a=roomFrame(one('[data-image="a"]'),1,amount,false);
      const b=roomFrame(one('[data-image="b"]'),4,amount,el('scale').checked);
      let changed=0;
      for(let i=0;i<a.data.length;i+=4)if(a.data[i]!==b.data[i]||a.data[i+1]!==b.data[i+1]||a.data[i+2]!==b.data[i+2])changed++;
      const lbl=el('amount').parentElement;
      lbl.querySelector('output').textContent=amount+'°';
      one('[data-room-measure]').textContent=(100*changed/(roomW*roomH)).toFixed(1)+'% pixels differ';
      one('[data-room-result]').textContent=amount===0?'Both images line up exactly. From this frame alone either room could have produced the footage.':el('scale').checked?'Enlarge both the scene and camera travel in the same proportion and the images line up again. Recovering absolute size requires a known measurement.':'Equal camera travel has a bigger effect in the miniature room. Now scale B’s camera travel to test whether the images alone can establish absolute size.';
    }
    function updateBench(){
      const s={};
      for(const name of ['travel','texture','light','repeat','moving','noise']){
        const input=el(name),percentage=!['travel','moving'].includes(name);
        const n=Number(input.value);s[name]=percentage?n/100:n;
        input.parentElement.querySelector('output').textContent=percentage?n+'%':name==='travel'?n+'°':n.toFixed(2)+' u';
      }
      const r=analyze(s), c1=one('[data-image="first"]').getContext('2d'),c2=one('[data-image="second"]').getContext('2d');
      c1.putImageData(r.a.img,0,0);c2.putImageData(r.b.img,0,0);
      for(let i=0;i<r.points.length;i++) {
        const p=r.points[i];c2.fillStyle=r.errors[i]>.5?'#ff9a66':'#79fff0';
        c2.fillRect(p.u2-1,p.v2-1,3,3);
      }
      one('[data-score]').textContent=r.points.length+' points · '+(r.rmse===null?'depth unavailable':r.rmse.toFixed(2)+' u error');
    }
    let pending=0;
    function redraw(){cancelAnimationFrame(pending);pending=requestAnimationFrame(()=>{
      if(one('[data-pane="room"]').hidden)updateBench();else updateRoom();
    });}
    container.addEventListener('input',redraw);
    container.addEventListener('click',e=>{
      const tab=e.target.closest('[data-tab]');
      if(tab){
        for(const b of container.querySelectorAll('[data-tab]'))b.setAttribute('aria-pressed',b===tab);
        for(const p of container.querySelectorAll('[data-pane]'))p.hidden=p.dataset.pane!==tab.dataset.tab;
        redraw();
      } else if(e.target.closest('.bl-reset')) {
        for(const input of one('[data-pane="bench"]').querySelectorAll('input'))input.value=input.defaultValue;
        redraw();
      }
    });
    updateRoom();
  }
  return {init};
})();
