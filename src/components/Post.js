import React, { Component } from 'react';
import '../styles/Post.css'
import '../styles/PostContent.css'
import '../styles/themes/orange-cheers.css'
import { Link } from 'react-router-dom'
import { FullPageLoader as Loader, InlineLoader } from './Loader'
import { post as config } from '../config'
import NotFound from "./404"
import Unreachable from "./000"
import honoka from 'honoka'
import { formatDate, human } from '../utils/datetime'
import urlEncode from '../utils/url'
import Comments from './Comments'

let initialState = {
  ready: false,
  post: null,
  posts: null,
  page: 1,
  totalPage: 0,
  category: null,
  tag: null,
  params: null,
  error: null,
};

class Post extends Component {
  constructor(props) {
    super(props);
    this.state = initialState;
    this.state.params = props.match.params;
    this.state.page = +props.match.params.page || 1;
    this.categories = {};
    this.tags = {};
    this.posts = {};
    this.indexes = {};
    this.update = this.update.bind(this);
    this.onReady = this.onReady.bind(this);
    this.challengeParams = this.challengeParams.bind(this);
    this.fetchData = this.fetchData.bind(this);
    this.fetchPostData = this.fetchPostData.bind(this);
    this.fetchPosts = this.fetchPosts.bind(this);
    this.fetchTagData = this.fetchTagData.bind(this);
    this.fetchCommentCount = this.fetchCommentCount.bind(this);
    this.fetchCommentCounts = this.fetchCommentCounts.bind(this);
  }

  componentDidMount() {
    this.props.startProgress();
    document.onreadystatechange = () => {
      if (document.readyState === "complete") {
        if (this.state.ready) this.props.doneProgress();
        else this.props.joinProgress();
      }
    };
    this.update()
  }

  onReady(error) {
    if (error === null) this.setState({ ready: true, error: null }, window.initMonacoEditor);
    else if (typeof error === 'function') this.setState({ ready: true, error: error });
    else this.setState({ ready: true });
    if (document.readyState === "complete") this.props.doneProgress();
    else this.props.joinProgress();
  }

  componentWillReceiveProps(nextProps) {
    let page = +nextProps.match.params.page || 1;
    if (nextProps.match.params.slug === this.state.params.slug &&
      page === this.state.page &&
      nextProps.match.params.category === this.state.params.category &&
      nextProps.match.params.tag === this.state.params.tag &&
      nextProps.match.params.search === this.state.params.search
    ) return;
    this.props.startProgress();
    this.setState(initialState);
    this.setState({ params: nextProps.match.params, page: page }, this.update);
  }

  update() {
    this.challengeParams()
      .then(() => this.fetchData())
  }

  challengeParams() {
    let promise = new Promise((resolve, reject) => {
      resolve();
    });
    if (this.state.params.slug) return promise;
    if (this.state.params.category) promise = promise.then(() => honoka.get('/categories', {
      data: {
        slug: this.state.params.category
      }
    })
      .then(data => {
        let cat = data.length === 0 ? null : data[0];
        if (cat === null) {
          this.onReady(404);
          throw "404";
        }
        this.setState({ category: cat.id });
        this.props.setTyped(cat.name);
      }));
    if (this.state.params.tag) promise = promise.then(() => honoka.get('/tags', {
      data: {
        slug: this.state.params.tag
      }
    })
      .then(data => {
        let tag = data.length === 0 ? null : data[0];
        if (tag === null) {
          this.onReady(404);
          throw "404";
        }
        this.setState({ tag: tag.id });
        this.props.setTyped(tag.name);
      }));
    return promise
  }

  fetchData() {
    if (this.state.params.slug) this.setState({ ready: false, error: null }, () =>
      this.fetchPostData(this.state.params.slug)
        .then(post => this.fetchCategoryData(post.categories, post))
        .then(post => this.fetchTagData(post.tags, post))
        .then(() => {
          this.onReady(null);
        })
        .catch(err => {
          console.log(err);
          if (err !== '404') this.onReady(this.fetchData)
        })
    );
    else this.setState({ ready: false, error: null }, () =>
      this.fetchPosts(this.state.page)
        .then(posts => {
          let categories = [];
          posts.forEach(post => {
            categories = categories.concat(post.categories);
          });
          return this.fetchCategoryData(categories, posts)
        })
        .then(posts => {
          let tags = [];
          posts.forEach(post => {
            tags = tags.concat(post.tags);
          });
          return this.fetchTagData(tags, posts)
        })
        .then(data => {
          this.onReady(null);
          return data;
        })
        .catch(err => {
          console.log(err);
          if (err !== '404') this.onReady(this.fetchData)
        })
    );
  }

  fetchPosts(page) {
    let params = {
      page: page,
      per_page: config.perPage,
    };
    if (this.state.category) params.categories = this.state.category;
    if (this.state.tag) params.tags = this.state.tag;
    if (this.state.params.search) params.search = this.state.params.search;
    params = urlEncode(params);
    if (this.indexes[params]) {
      let data = this.indexes[params].posts.map(slug => this.posts[slug]);
      this.setState({ posts: data, totalPage: this.indexes[params].totalPage });
      return new Promise(resolve => {
        resolve(data);
      });
    }
    return fetch(honoka.defaults.baseURL + '/posts?' + params)
      .then(response => {
        let totalPage = response.headers.get("x-wp-totalpages");
        this.setState({ totalPage: +totalPage });
        return response.json()
          .then(data => {
            data.forEach(post => {
              this.posts[post.slug] = post
            });
            this.indexes[params] = {
              posts: data.map(post => post.slug),
              totalPage: totalPage,
            };
            this.setState({ posts: data }, () => this.fetchCommentCounts(data));
            return data;
          })
      });
  }

  fetchPostData(slug) {
    if (this.posts[this.state.params.slug]) {
      this.setState({ post: this.posts[this.state.params.slug] });
      return new Promise(resolve => {
        resolve(this.posts[this.state.params.slug]);
      });
    }
    return honoka.get('/posts', {
      data: {
        slug: slug
      }
    })
      .then(data => {
        let post = data.length === 0 ? null : data[0];
        if (post === null) {
          this.onReady(404);
          throw "404";
        }
        return post
      })
      .then(post => {
        this.posts[post.slug] = post;
        if (this.state.params.slug === post.slug) this.setState({ post: post });
        this.fetchCommentCount(post);
        return post
      })
  }

  fetchCommentCounts(posts) {
    let promise = new Promise((resolve, reject) => {
      resolve();
    });
    for (let post of posts) {
      promise = promise.then(() => this.fetchCommentCount(post))
    }
    return promise.then(() => {
      return posts;
    })
  }

  fetchCommentCount(post) {
    return fetch(honoka.defaults.baseURL + '/comments?' + urlEncode({
      post: post.id,
      per_page: 1
    }))
      .then(response => {
        let total = response.headers.get("x-wp-total");
        post.commentCount = +total;
        this.posts[post.slug].commentCount = total;
        if (this.state.post !== null && this.state.post.slug === post.slug) this.setState({ post: post });
        else if (this.state.posts !== null) {
          this.setState({
            posts: this.state.posts.map(p => {
              return p.id === post.id ? post : p;
            })
          })
        }
        return post
      })
  }

  fetchCategoryData(cats, o) {
    let flag = true;
    for (let cat of cats) {
      if (!this.categories[cat]) {
        flag = false;
        break;
      }
    }
    if (flag) return o;
    return honoka.get('/categories', {
      data: {
        include: cats.join(','),
        per_page: 100,
      }
    })
      .then(data => {
        data.forEach(cat => {
          this.categories[cat.id] = cat
        });
        return o;
      })
  }

  fetchTagData(tags, o) {
    if (tags.length === 0) {
      return o;
    }
    let flag = true;
    for (let tag of tags) {
      if (!this.tags[tag]) {
        flag = false;
        break;
      }
    }
    if (flag) return o;
    return honoka.get('/tags', {
      data: {
        include: tags.join(','),
        per_page: 100,
      }
    })
      .then(data => {
        console.log(data);
        data.forEach(tag => {
          this.tags[tag.id] = tag
        });
        return o;
      })
  }

  renderPost(post, fold) {
    const categories = post.categories.filter(cate => {
      return this.categories[cate]
    }).map(cate => {
      return <Link key={this.categories[cate].slug} className="category-link"
                   to={`/category/${this.categories[cate].slug}`}>{this.categories[cate].name}</Link>
    });
    const tags = post.tags.filter(tag => {
      return this.tags[tag]
    }).map(tag => {
      return <Link key={this.tags[tag].slug} className="tag-link"
                   to={`/tag/${this.tags[tag].slug}`}>{this.tags[tag].name}</Link>
    });
    let commentCount;
    if (post.commentCount === undefined) commentCount =
      <span className="fas fa-comments">评论数拉取中 {InlineLoader}</span>;
    else {
      commentCount = post.commentCount === 0 ? '还没有评论耶' : post.commentCount === 1 ?
        `${post.commentCount} 条评论` : `${post.commentCount} 条评论`;
      commentCount =
        <span className="fas fa-comments"><Link to={`/${post.slug}#Comments`}>{commentCount}</Link></span>;
    }
    const dateStr = formatDate(post.date_gmt + '.000Z');
    let date = [];
    date.push(<span key="date" className="fas fa-calendar">发表于 {dateStr}</span>);
    if (formatDate(post.modified_gmt + '.000Z') !== dateStr) {
      date.push(<span key="modified"
                      className="fas fa-pencil-alt">最后更新于 {human(post.modified_gmt + '.000Z')}</span>)
    }
    return fold ? (
      <div className="post">
        <Link className="post-title-link" to={`/${post.slug}`}>
          <h1 className="title fee page-control" dangerouslySetInnerHTML={{ __html: post.title.rendered }} />
        </Link>
        <div className="content page-control">
          <div className="post-content" dangerouslySetInnerHTML={{ __html: post.excerpt.rendered }} />
        </div>
        <div className="info eef page-control">
          {date}
          {commentCount}
          <span className="fas fa-folder">
            {categories}
            </span>
          {/*<span className="fas fa-eye" >498 Hits</span>*/}
          {
            tags.length === 0 ? '' :
              <span className="fas extra fa-tags">
              {tags}
            </span>
          }
        </div>
      </div>
    ) : (
      <div className="post">
        <h1 className="title fee page-control" dangerouslySetInnerHTML={{ __html: post.title.rendered }} />
        <div className="info fee page-control">
          {date}
          {commentCount}
          <span className="fas fa-folder">
            {categories}
            </span>
          {/*<span className="fas fa-eye" >498 Hits</span>*/}
          {
            tags.length === 0 ? '' :
              <span className="fas extra fa-tags">
              {tags}
            </span>
          }
        </div>
        <div className="content page-control">
          <div className="post-content" dangerouslySetInnerHTML={{ __html: post.content.rendered }} />
        </div>
        {
          this.props.siblings ?
            <div className="info eef">
              <span>上一篇：<Link to="/">2018年美团在线笔试编程题解题报告</Link></span>
              <span>下一篇：<Link to="/">Windows下安装libsvm for Python</Link></span>
            </div> : ''
        }
      </div>
    )
  }

  renderPagination() {
    if (this.state.totalPage === 1) return '';
    let slug = '';
    if (this.state.params.category) slug += `/category/${this.state.params.category}`;
    else if (this.state.params.tag) slug += `/tag/${this.state.params.tag}`;
    return (
      <div className="page-container pagination">
        <div className="nav-links">
          {
            this.state.page > 1 ?
              <Link className="prev" to={`${slug}/page/${this.state.page - 1}`}><i
                className="fas fa-chevron-left" /></Link>
              : ''
          }
          {
            this.state.page > 3 ?
              <Link className="page-number" to={`${slug}/page/1`}>1</Link>
              : ''
          }
          {
            this.state.page > 4 ?
              <span className="space">…</span>
              : ''
          }
          {
            this.state.page > 2 ?
              <Link className="page-number" to={`${slug}/page/${this.state.page - 2}`}>{this.state.page - 2}</Link>
              : ''
          }
          {
            this.state.page > 1 ?
              <Link className="page-number" to={`${slug}/page/${this.state.page - 1}`}>{this.state.page - 1}</Link>
              : ''
          }
          <span className="page-number current">{this.state.page}</span>
          {
            this.state.page < this.state.totalPage ?
              <Link className="page-number" to={`${slug}/page/${this.state.page + 1}`}>{this.state.page + 1}</Link>
              : ''
          }
          {
            this.state.page + 1 < this.state.totalPage ?
              <Link className="page-number" to={`${slug}/page/${this.state.page + 2}`}>{this.state.page + 2}</Link>
              : ''
          }
          {
            this.state.page + 3 < this.state.totalPage ?
              <span className="space">…</span>
              : ''
          }
          {
            this.state.page + 2 < this.state.totalPage ?
              <Link className="page-number" to={`${slug}/page/${this.state.totalPage}`}>{this.state.totalPage}</Link>
              : ''
          }
          {
            this.state.page < this.state.totalPage ?
              <Link className="next" to={`${slug}/page/${this.state.page + 1}`}><i
                className="fas fa-chevron-right" /></Link>
              : ''
          }
        </div>
      </div>
    );
  }

  render() {
    if (!this.state.ready) {
      return (
        <div className="container page">
          <div className="page-container">
            {Loader}
          </div>
        </div>
      )
    }
    if (this.state.error) {
      return <Unreachable retry={this.state.error} />
    }
    if (this.state.params.slug) {
      if (!this.state.post) {
        return <NotFound />
      }
      return (
        <div className="container page post">
          <div className="page-container">
            {this.renderPost(this.state.post, false)}
          </div>
          {
            this.state.post.comment_status === "open" ?
              <Comments id={this.state.post.id} />
              : ''
          }
        </div>
      );
    }
    if (this.state.posts === null) {
      return <NotFound />
    }
    return (
      <div className="container page">
        {
          this.state.posts.map(post => {
            return <div key={post.id} className="page-container">
              {this.renderPost(post, true)}
            </div>;
          })
        }
        {this.renderPagination()}
      </div>
    )
  }
}

export default Post;