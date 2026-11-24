// Calibrated, two-view structure from motion. The pose maps camera A into camera B.
// Internal camera coordinates are right/down/forward; public point clouds use Y up.
globalThis.Pose = (() => {
  const dot = (a,b) => a.reduce((s,v,i) => s + v*b[i], 0);
  const norm = a => Math.hypot(...a);
  const unit = a => a.map(v => v / (norm(a) || 1));
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const tr = m => m[0].map((_,i) => m.map(row => row[i]));
  const mv = (m,v) => m.map(row => dot(row,v));
  const mul = (a,b) => a.map(row => tr(b).map(col => dot(row,col)));
  const eye = n => Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>Number(i===j)));
  const median = a => [...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];

  // Symmetric Jacobi eigenproblem. Columns of V track the plane rotations.
  function eigen(A) {
    const n=A.length, V=eye(n);
    for(let sweep=0;sweep<32;sweep++) {
      let changed=false;
      for(let i=0;i<n;i++) for(let j=i+1;j<n;j++) {
        const off=A[i][j];
        if(Math.abs(off)<1e-13*(1+Math.abs(A[i][i])+Math.abs(A[j][j]))) continue;
        changed=true;
        const angle=0.5*Math.atan2(2*off,A[j][j]-A[i][i]);
        const c=Math.cos(angle),s=Math.sin(angle), ai=A[i][i],aj=A[j][j];
        for(let k=0;k<n;k++) {
          if(k!==i&&k!==j) {
            const ki=A[k][i],kj=A[k][j];
            A[k][i]=A[i][k]=c*ki-s*kj;
            A[k][j]=A[j][k]=s*ki+c*kj;
          }
          const vi=V[k][i],vj=V[k][j];
          V[k][i]=c*vi-s*vj; V[k][j]=s*vi+c*vj;
        }
        A[i][i]=c*c*ai-2*s*c*off+s*s*aj;
        A[j][j]=s*s*ai+2*s*c*off+c*c*aj;
        A[i][j]=A[j][i]=0;
      }
      if(!changed) break;
    }
    return tr(V).map((v,i)=>({v,value:A[i][i]})).sort((a,b)=>a.value-b.value);
  }

  function pyramid(image) {
    let w=image.width,h=image.height, data=new Float32Array(w*h);
    for(let i=0;i<data.length;i++) data[i]=(image.data[4*i]*77+image.data[4*i+1]*150+image.data[4*i+2]*29)/256;
    const levels=[{w,h,data}];
    while(levels.length<4 && Math.min(w,h)>=60) {
      const nw=w>>1, nh=h>>1, reduced=new Float32Array(nw*nh);
      for(let y=0;y<nh;y++) for(let x=0;x<nw;x++) {
        const i=2*y*w+2*x;
        reduced[y*nw+x]=(data[i]+data[i+1]+data[i+w]+data[i+w+1])/4;
      }
      w=nw; h=nh; data=reduced; levels.push({w,h,data});
    }
    return levels;
  }

  function at(level,x,y) {
    const ix=Math.floor(x),iy=Math.floor(y), fx=x-ix,fy=y-iy, i=iy*level.w+ix,d=level.data;
    return (1-fy)*(d[i]*(1-fx)+d[i+1]*fx)+fy*(d[i+level.w]*(1-fx)+d[i+level.w+1]*fx);
  }

  function goodCorners({data,w,h}) {
    const out=[];
    // Pick the strongest Shi-Tomasi corner per cell to spread evidence across the image.
    for(let top=8;top<h-8;top+=12) for(let left=8;left<w-8;left+=12) {
      let best=600, point;
      for(let y=top;y<Math.min(top+12,h-8);y+=2) for(let x=left;x<Math.min(left+12,w-8);x+=2) {
        let xx=0,yy=0,xy=0;
        for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++) {
          const i=(y+dy)*w+x+dx, gx=data[i+1]-data[i-1],gy=data[i+w]-data[i-w];
          xx+=gx*gx; yy+=gy*gy; xy+=gx*gy;
        }
        const score=(xx+yy-Math.hypot(xx-yy,2*xy))/2;
        if(score>best) {best=score;point=[x,y];}
      }
      if(point) out.push(point);
    }
    return out;
  }

  // Coarse-to-fine Lucas-Kanade optical flow. Reject patches whose two gradient
  // directions are ill-conditioned, as well as matches that leave the image.
  function track(a,b,p) {
    let dx=0,dy=0;
    for(let l=a.length-1;l>=0;l--) {
      dx*=2;dy*=2;
      const aa=a[l],bb=b[l], scale=2**l;
      const x=p[0]/scale,y=p[1]/scale;
      const inside=(x,y)=>x>=5&&y>=5&&x<aa.w-6&&y<aa.h-6;
      if(!inside(x,y)) {if(l) continue; return null;}
      for(let k=0;k<12;k++) {
        if(!inside(x+dx,y+dy)) {if(l) break; return null;}
        let xx=0,xy=0,yy=0,xt=0,yt=0,err=0;
        for(let j=-3;j<=3;j++) for(let i=-3;i<=3;i++) {
          const bx=x+i+dx,by=y+j+dy;
          const diff=at(aa,x+i,y+j)-at(bb,bx,by);
          const gx=(at(bb,bx+1,by)-at(bb,bx-1,by))/2;
          const gy=(at(bb,bx,by+1)-at(bb,bx,by-1))/2;
          xx+=gx*gx;xy+=gx*gy;yy+=gy*gy;xt+=gx*diff;yt+=gy*diff;err+=Math.abs(diff);
        }
        const det=xx*yy-xy*xy;
        if(det<1e-5*(xx+yy)**2 || det<1) {if(l)break;return null;}
        const sx=Math.max(-2,Math.min(2,(yy*xt-xy*yt)/det));
        const sy=Math.max(-2,Math.min(2,(xx*yt-xy*xt)/det));
        dx+=sx;dy+=sy;
        if(sx*sx+sy*sy<0.0009 || k===11) {
          if(!l && err/49>18) return null;
          break;
        }
      }
    }
    return [p[0]+dx,p[1]+dy];
  }

  function pairsFrom(a,b) {
    const pa=pyramid(a),pb=pyramid(b),out=[];
    for(const p of goodCorners(pa[0])) {
      const q=track(pa,pb,p);
      if(!q) continue;
      const check=track(pb,pa,q);
      if(check && Math.hypot(check[0]-p[0],check[1]-p[1]) <= 0.9) out.push({p,q});
    }
    return out;
  }

  function conditioning(vectors) {
    const x=vectors.reduce((s,v)=>s+v[0],0)/vectors.length;
    const y=vectors.reduce((s,v)=>s+v[1],0)/vectors.length;
    const rms=Math.sqrt(vectors.reduce((s,v)=>s+(v[0]-x)**2+(v[1]-y)**2,0)/vectors.length);
    const scale=Math.SQRT2/Math.max(rms,1e-9);
    return [[scale,0,-scale*x],[0,scale,-scale*y],[0,0,1]];
  }

  // Solve b' E a = 0 using an eight-point sample or all consensus inliers.
  function essential(sample) {
    const A=conditioning(sample.map(p=>p.a)), B=conditioning(sample.map(p=>p.b));
    const ata=Array.from({length:9},()=>Array(9).fill(0));
    for(const p of sample) {
      const a=mv(A,p.a), b=mv(B,p.b), row=b.flatMap(v=>a.map(u=>v*u));
      for(let i=0;i<9;i++) for(let j=i;j<9;j++) ata[j][i]=ata[i][j]+=row[i]*row[j];
    }
    const eig=eigen(ata);
    if(eig[1].value<1e-8) return null;
    const h=eig[0].v;
    return mul(mul(tr(B),[h.slice(0,3),h.slice(3,6),h.slice(6)]),A);
  }

  function distance(E,Et,{a,b}) {
    const l=mv(E,a),r=mv(Et,b),err=dot(b,l);
    return err*err/(l[0]**2+l[1]**2+r[0]**2+r[1]**2+1e-18);
  }

  function poses(E) {
    // Impose equal leading singular values and a zero third singular value:
    // only the singular bases of the linear estimate are needed for pose.
    const eig=eigen(mul(tr(E),E)), v1=eig[2].v,v2=eig[1].v;
    const u1=unit(mv(E,v1)),raw=mv(E,v2),proj=dot(raw,u1);
    const u2=unit(raw.map((v,i)=>v-proj*u1[i])),t=unit(cross(u1,u2));
    const U=tr([u1,u2,t]), Vt=[v1,v2,cross(v1,v2)];
    const W=[[0,-1,0],[1,0,0],[0,0,1]];
    return [W,tr(W)].flatMap(w=>{
      const R=mul(mul(U,w),Vt);
      return [{R,t},{R,t:t.map(v=>-v)}];
    });
  }

  // Locally refine five pose degrees of freedom against signed epipolar error.
  // Rotations use the exponential map. Translation is normalized after every step.
  function perturb(pose,step) {
    const omega=step.slice(0,3), theta=norm(omega);
    const axis=theta?unit(omega):[0,0,0];
    const R=tr(tr(pose.R).map(col=>{
      const v=cross(axis,col),along=dot(axis,col);
      return col.map((x,i)=>Math.cos(theta)*x+Math.sin(theta)*v[i]+(1-Math.cos(theta))*along*axis[i]);
    }));
    const t=pose.t;
    const tangent=unit(cross(t,Math.abs(t[1])<0.8?[0,1,0]:[1,0,0]));
    const bitangent=cross(t,tangent);
    return {R,t:unit(t.map((v,i)=>v+step[3]*tangent[i]+step[4]*bitangent[i]))};
  }

  function residuals(pose,pairs,focal) {
    const rT=tr(pose.R);
    return pairs.map(({a,b})=>{
      const lineB=cross(pose.t,mv(pose.R,a));
      const lineA=mv(rT,cross(b,pose.t));
      return focal*dot(b,lineB)/Math.max(1e-10,Math.hypot(lineB[0],lineB[1],lineA[0],lineA[1]));
    });
  }

  function linearSolve(matrix,rhs) {
    const a=matrix.map((row,i)=>[...row,rhs[i]]),n=rhs.length;
    for(let i=0;i<n;i++) {
      let pivot=i;
      for(let k=i+1;k<n;k++) if(Math.abs(a[k][i])>Math.abs(a[pivot][i])) pivot=k;
      [a[i],a[pivot]]=[a[pivot],a[i]];
      if(Math.abs(a[i][i])<1e-12) return null;
      const scale=a[i][i];
      for(let j=i;j<=n;j++) a[i][j]/=scale;
      for(let k=0;k<n;k++) if(k!==i) {
        const factor=a[k][i];
        for(let j=i;j<=n;j++) a[k][j]-=factor*a[i][j];
      }
    }
    return a.map(row=>row[n]);
  }

  function refine(initial,pairs,focal) {
    let pose=initial, damping=0.001;
    const robust=rs=>rs.reduce((sum,e)=>sum+Math.log1p((e/0.6)**2),0);
    for(let iteration=0;iteration<12;iteration++) {
      const errs=residuals(pose,pairs,focal);
      const derivatives=eye(5).map(axis=>{
        const next=perturb(pose,axis.map(x=>x*1e-5));
        return residuals(next,pairs,focal).map((v,i)=>(v-errs[i])/1e-5);
      });
      const weights=errs.map(e=>1/(1+(e/0.6)**2));
      const weightedDot=(x,y)=>x.reduce((s,v,i)=>s+weights[i]*v*y[i],0);
      const a=derivatives.map(row=>derivatives.map(col=>weightedDot(row,col)));
      for(let i=0;i<5;i++) a[i][i]+=damping*(1+a[i][i]);
      const step=linearSolve(a,derivatives.map(row=>-weightedDot(row,errs)));
      if(!step || norm(step)<1e-7) break;
      const next=perturb(pose,step);
      if(robust(residuals(next,pairs,focal))<robust(errs)) {pose=next;damping*=0.5;}
      else damping*=5;
    }
    return pose;
  }

  function triangulate(pair,pose,focal) {
    const {R,t}=pose, ray=mv(R,pair.a), b=pair.b;
    // Solve ray*depthA - b*depthB = -translation for closest points on two rays.
    const aa=dot(ray,ray),bb=dot(b,b),ab=dot(ray,b),det=aa*bb-ab*ab;
    if(det<1e-10) return null;
    const z=(-bb*dot(ray,t)+ab*dot(b,t))/det;
    const p=ray.map((v,i)=>v*z+t[i]);
    if(z<=0 || p[2]<=0) return null;
    const err=focal*Math.hypot(p[0]/p[2]-b[0],p[1]/p[2]-b[1]);
    const angle=Math.acos(Math.min(1,Math.max(-1,ab/Math.sqrt(aa*bb))))*180/Math.PI;
    if(err>2.5 || angle<0.35) return null;
    return {x:pair.a[0]*z,y:-pair.a[1]*z,z,u:pair.p[0],v:pair.p[1],
      u2:pair.q[0],v2:pair.q[1],angle};
  }

  function reconstruct(pixelPairs,w,h,focal) {
    const empty=reason=>({points:[],matches:pixelPairs.length,pose:null,reason});
    if(pixelPairs.length<15) return empty('Too few repeatable corners');
    const calibrate=uv=>[(uv[0]-w/2)/focal,(uv[1]-h/2)/focal,1];
    const pairs=pixelPairs.map(pair=>({...pair,a:calibrate(pair.p),b:calibrate(pair.q)}));
    let state=18571;
    const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
    let best=[], bestCost=Infinity,limit=480;
    const threshold=(1.2/focal)**2;
    for(let trial=0;trial<limit;trial++) {
      const chosen=new Set();
      while(chosen.size<8) chosen.add(Math.floor(random()*pairs.length));
      const E=essential([...chosen].map(i=>pairs[i]));
      if(!E) continue;
      const Et=tr(E),inliers=[];
      let cost=0;
      for(const pair of pairs) {
        const err=distance(E,Et,pair);
        cost+=Math.min(err,threshold);
        if(err<threshold) inliers.push(pair);
      }
      if(cost<bestCost) {
        bestCost=cost;best=inliers;
        const miss=Math.max(1e-7,1-(best.length/pairs.length)**8);
        limit=Math.min(limit,Math.max(30,Math.ceil(Math.log(0.005)/Math.log(miss))));
      }
    }
    if(best.length<Math.max(15,pairs.length*0.42)) return empty('Inconsistent scene motion');
    let E=essential(best);
    if(!E) return empty('Scene geometry is ambiguous');
    const Et=tr(E);
    best=pairs.filter(p=>distance(E,Et,p)<threshold);
    E=essential(best);
    if(!E) return empty('Scene geometry is ambiguous');
    let result=[], pose=null;
    for(const candidate of poses(E)) {
      const points=best.map(p=>triangulate(p,candidate,focal)).filter(Boolean);
      if(points.length>result.length) {result=points;pose=candidate;}
    }
    if(pose) {
      pose=refine(pose,best,focal);
      result=best.map(p=>triangulate(p,pose,focal)).filter(Boolean);
    }
    if(result.length<Math.max(12,best.length*0.64) || median(result.map(p=>p.angle))<1)
      return empty('Too little reliable parallax');
    return {points:result,matches:pairs.length,pose};
  }

  function solve(a,b,focal) {
    if(a.width!==b.width || a.height!==b.height || !(focal>0)) throw new Error('Invalid camera frames');
    return reconstruct(pairsFrom(a,b),a.width,a.height,focal);
  }
  return {solve,reconstruct};
})();
