
window.KenteiExam=(()=>{
  const KEY='kentei_word_exam_v1';
  const $=id=>document.getElementById(id);
  const Q=()=>window.WORD_QUESTIONS||[];
  const shuffle=a=>[...a].sort(()=>Math.random()-.5);
  const esc=s=>String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  let session=null;
  let current=null;
  let choices=[];
  let locked=false;

  function save(){
    if(session)localStorage.setItem(KEY,JSON.stringify(session));
  }

  function load(){
    try{
      const raw=localStorage.getItem(KEY);
      return raw?JSON.parse(raw):null;
    }catch{return null}
  }

  function clear(){
    localStorage.removeItem(KEY);
    session=null;
  }

  function labelCategory(value){
    return value==='all'?'全分野':value.replace('系','');
  }

  function setupPool(category){
    return category==='all'?Q():Q().filter(q=>q.category===category);
  }

  function currentCount(){
    const value=document.querySelector('input[name="examCount"]:checked')?.value||'10';
    if(value==='custom'){
      return Math.max(1,Math.min(200,Number($('customExamCount').value)||1));
    }
    return Number(value);
  }

  function renderSetup(){
    const saved=load();
    const card=$('wordExamResumeCard');
    if(saved&&saved.order&&saved.position<saved.order.length){
      card.classList.remove('hidden');
      $('wordExamResumeDetail').textContent=
        `${labelCategory(saved.category)}・${saved.order.length}問・${saved.position+1}問目から`;
    }else{
      card.classList.add('hidden');
    }
    $('wordExamSetupStatus').textContent='';
  }

  function startNew(){
    const count=currentCount();
    const category=document.querySelector('input[name="examCategory"]:checked')?.value||'all';
    const scoring=document.querySelector('input[name="examScoring"]:checked')?.value||'instant';
    const pool=setupPool(category);

    if(!pool.length){
      $('wordExamSetupStatus').textContent='対象の問題がありません。';
      return;
    }

    const actual=Math.min(count,pool.length);
    session={
      category,
      scoring,
      order:shuffle(pool.map(q=>q.id)).slice(0,actual),
      position:0,
      answers:[],
      correct:0,
      startedAt:Date.now()
    };
    save();
    KenteiRouter.show('wordExam');
    showQuestion();
  }

  function resume(){
    session=load();
    if(!session)return;
    KenteiRouter.show('wordExam');
    showQuestion();
  }

  function discard(){
    clear();
    renderSetup();
    if(typeof showToast==='function')showToast('前回の試験を削除しました');
  }

  function showQuestion(){
    locked=false;
    current=Q().find(q=>q.id===session.order[session.position]);
    if(!current){finish();return}

    $('wordExamCategory').textContent=labelCategory(session.category);
    $('wordExamProgress').textContent=`${session.position+1} / ${session.order.length}`;
    $('wordExamQuestion').textContent=current.meaning;
    $('wordExamAnswerResult').className='answer-result hidden';
    $('wordExamAnswerResult').innerHTML='';
    $('wordExamNextButton').classList.add('hidden');

    const candidates=shuffle(Q().filter(q=>q.category===current.category&&q.id!==current.id&&q.word!==current.word));
    const distractors=[];
    for(const q of candidates){
      if(!distractors.some(x=>x.word===q.word)){
        distractors.push(q);
        if(distractors.length===3)break;
      }
    }

    choices=shuffle([current,...distractors]);
    $('wordExamChoiceArea').innerHTML='';
    choices.forEach(item=>{
      const button=document.createElement('button');
      button.className='quiz-choice';
      button.textContent=item.word;
      button.addEventListener('click',()=>answer(item,button));
      $('wordExamChoiceArea').appendChild(button);
    });

    updateStats();
    save();
  }

  function answer(item,button){
    if(locked)return;
    locked=true;

    const ok=item.id===current.id;
    session.answers.push({
      questionId:current.id,
      selectedId:item.id,
      correct:ok
    });
    if(ok)session.correct++;

    KenteiWord.record(current,ok);

    if(session.scoring==='instant'){
      document.querySelectorAll('#wordExamChoiceArea .quiz-choice').forEach(b=>{
        b.disabled=true;
        if(b.textContent===current.word)b.classList.add('correct');
      });
      if(!ok)button.classList.add('wrong');

      const explanation=choices.map(c=>`
        <div class="explanation-item ${c.id===current.id?'correct':''} ${!ok&&c.id===item.id?'selected':''}">
          <div class="explanation-word">${esc(c.word)} ${c.id===current.id?'⭕':''}</div>
          <div class="explanation-meaning">${esc(c.meaning)}</div>
        </div>
      `).join('');

      $('wordExamAnswerResult').className='answer-result '+(ok?'ok':'ng');
      $('wordExamAnswerResult').innerHTML=`
        <div class="answer-title">${ok?'⭕ 正解！':'❌ 不正解'}</div>
        ${ok?'':`正解：<b>${esc(current.word)}</b>`}
        <div class="explanation-list">${explanation}</div>
      `;
      $('wordExamNextButton').classList.remove('hidden');
    }else{
      next();
      return;
    }

    updateStats();
    save();
  }

  function next(){
    session.position++;
    if(session.position>=session.order.length){
      finish();
      return;
    }
    showQuestion();
  }

  function updateStats(){
    const answered=session.answers.length;
    const remaining=session.order.length-answered;
    $('wordExamAnswered').textContent=answered;
    $('wordExamRemaining').textContent=remaining;
    $('wordExamCurrentRate').textContent=answered?((session.correct/answered)*100).toFixed(1)+'%':'0%';
  }

  function exit(){
    if(!session){KenteiRouter.show('exam');return}
    save();
    KenteiRouter.show('wordExamSetup');
    if(typeof showToast==='function')showToast('試験を保存しました');
  }

  function finish(){
    const completed={...session,finishedAt:Date.now()};
    localStorage.setItem('kentei_word_exam_last_result',JSON.stringify(completed));
    clear();
    renderResult(completed);
    KenteiRouter.show('wordExamResult');
  }

  function getLastResult(){
    try{
      const raw=localStorage.getItem('kentei_word_exam_last_result');
      return raw?JSON.parse(raw):null;
    }catch{return null}
  }

  function showResult(result){
    if(!result)return;
    const total=result.order.length;
    const correct=result.correct;
    const wrong=total-correct;
    const rate=total?((correct/total)*100):0;
    const score=Math.round(rate);

    $('wordExamScore').textContent=`${score}点`;
    $('wordExamSummary').textContent=`${total}問中 ${correct}問正解`;
    $('wordExamCorrectCount').textContent=correct;
    $('wordExamWrongCount').textContent=wrong;
    $('wordExamRate').textContent=rate.toFixed(1)+'%';

    const wrongAnswers=result.answers.filter(a=>!a.correct);
    const list=$('wordExamWrongList');
    if(!wrongAnswers.length){
      list.innerHTML='<div class="empty-card">全問正解です！</div>';
      $('reviewWordExamButton').classList.add('hidden');
      return;
    }

    $('reviewWordExamButton').classList.remove('hidden');
    list.innerHTML=wrongAnswers.map(a=>{
      const q=Q().find(x=>x.id===a.questionId);
      return q?`
        <div class="exam-wrong-item">
          <strong>${esc(q.word)}</strong>
          <span>${esc(q.meaning)}</span>
        </div>
      `:'';
    }).join('');
  }

  function reviewWrong(){
    const result=getLastResult();
    if(!result)return;
    const ids=result.answers.filter(a=>!a.correct).map(a=>a.questionId);
    if(!ids.length)return;
    KenteiQuiz.start('all',{order:ids,position:0});
  }

  function init(){
    $('openWordExamButton')?.addEventListener('click',()=>KenteiRouter.show('wordExamSetup'));
    $('startWordExamButton')?.addEventListener('click',startNew);
    $('resumeWordExamButton')?.addEventListener('click',resume);
    $('discardWordExamButton')?.addEventListener('click',discard);
    $('wordExamNextButton')?.addEventListener('click',next);
    $('wordExamExitButton')?.addEventListener('click',exit);
    $('reviewWordExamButton')?.addEventListener('click',reviewWrong);

    document.querySelectorAll('input[name="examCount"]').forEach(input=>{
      input.addEventListener('change',()=>{
        $('customExamCount').classList.toggle('hidden',input.value!=='custom'||!input.checked);
      });
    });

    document.addEventListener('kentei:route',event=>{
      if(event.detail==='wordExamSetup')renderSetup();
      if(event.detail==='wordExamResult')showResult(getLastResult());
    });
  }

  return{init,startNew,resume,discard};
})();
