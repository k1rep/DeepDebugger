import numpy as np
import torch
import torch.nn
import torch.optim as optim
from torch.utils.data import DataLoader, Subset
from scipy.special import softmax
from sklearn.neighbors import NearestNeighbors
from pynndescent import NNDescent

from query_strategies.query_strategy import QueryMethod
from query_strategies.query_strategy import get_unlabeled_idx
# from query_strategy import QueryMethod
# from query_strategy import get_unlabeled_idx


def find_closest_dists(queries, pool, k):
    if len(queries)==0:
        return np.array([])
    # index = NNDescent(pool, metric="cosine")
    # _, dists = index.query(queries, k=k)
    nbrs = NearestNeighbors(n_neighbors=k, metric="cosine").fit(pool)
    indices = nbrs.kneighbors(queries, return_distance=False)
    return indices


class FeedbackSampling(QueryMethod):
    """
    The basic uncertainty sampling query strategy, querying the examples with the minimal top confidence.
        adopt from discriminative active learning repo
        https://github.com/dsgissin/DiscriminativeActiveLearning/blob/master/query_methods.py
    """

    def __init__(self, model, model_type, n_pool, init_lb, num_classes, dataset_name, model_name, gpu=None, **kwargs):

        super(FeedbackSampling, self).__init__(model, model_type, n_pool)
        self.strategy_name = "Feedback"
        self.dataset_name = dataset_name
        self.model_name = model_name
        self.num_classes = num_classes
        self.lb_idxs = init_lb
        if gpu is None:
            self.device = torch.device("cpu")
        elif type(gpu) == str:
            self.device = torch.device("cuda:{}".format(gpu))
        self.kwargs = kwargs

    def query(self, complete_dataset, budget, all_repr, selected_idxs):
        unlabeled_idx = get_unlabeled_idx(self.n_pool, self.lb_idxs)
        remain_idx = np.setdiff1d(unlabeled_idx, selected_idxs)

        query_set = Subset(complete_dataset, remain_idx)
        query_loader = DataLoader(query_set, shuffle=False, **self.kwargs['loader_te_args'])

        self.task_model.to(self.device)
        self.task_model.eval()
        optimizer = optim.SGD(
            self.task_model.parameters(), lr=self.kwargs['optimizer_args']['lr'], momentum=self.kwargs['optimizer_args']['momentum'], weight_decay=self.kwargs['optimizer_args']['weight_decay']
        )
        criterion = torch.nn.CrossEntropyLoss(reduction='none')

        query_num = len(query_set)
        batch_size = self.kwargs['loader_te_args']['batch_size']
        pred = np.zeros((query_num, self.num_classes))
        label = np.zeros((query_num))
        losses = np.zeros((query_num))

        for idx, (x, y) in enumerate(query_loader):
            x, y = x.to(self.device), y.to(self.device)
            optimizer.zero_grad()
            out = self.task_model(x)
            loss = criterion(out, y)
            loss.backward()
            optimizer.step()

            pred[idx*batch_size:(idx+1)*batch_size] = out.detech().cpu().numpy()
            label[idx*batch_size:(idx+1)*batch_size] = y.detech().cpu().numpy()
            losses[idx*batch_size:(idx+1)*batch_size] = loss.detech().cpu().numpy()

        # uncertainty score
        sm = softmax(pred, axis=1)
        unlabeled_predictions = np.amax(sm, axis=1)

        # feedback score, based on the similarity score to the selected_idxs
        # metric: euclidean distance
        # check empty array
        # sim_scores = np.zeros(len(unlabeled_predictions))
        # if selected_idxs.shape[0] > 0:
        #     selected_repr = all_repr[selected_idxs]
        #     remain_repr = all_repr[remain_idx]
        #     indices = find_closest_dists(selected_repr, remain_repr, 5)
        #     indices = np.unique(indices).astype(np.int64)
        #     sim_scores[indices] = 1.

        # true wrong prediction scores
        # predictions = np.argmax(sm, axis=1)
        # pred_scores = np.zeros(len(pred))
        # pred_scores[np.where(predictions==label)] = 1.

        scores = (1-unlabeled_predictions)*losses
        selected_indices = np.argsort(scores)[-budget:]
        # selected_indices = np.random.choice(np.argwhere(pred_scores==1).squeeze(), size=budget, replace=False)
        return remain_idx[selected_indices], scores[selected_indices]


    def update_lb_idxs(self, new_indices):
        self.lb_idxs = new_indices

    def train(self, total_epoch, task_model, complete_dataset):

        """
        Only train samples from labeled dataset
        :return:
        """
        print("[Training] labeled and unlabeled data")

        task_model.to(self.device)
        # setting idx_lb
        idx_lb_train = self.lb_idxs
        train_dataset = Subset(complete_dataset, idx_lb_train)
        train_loader = DataLoader(train_dataset, batch_size=self.kwargs['loader_tr_args']['batch_size'], shuffle=True, num_workers=self.kwargs['loader_tr_args']['num_workers'])
        optimizer = optim.SGD(
            task_model.parameters(), lr=self.kwargs['optimizer_args']['lr'], momentum=self.kwargs['optimizer_args']['momentum'], weight_decay=self.kwargs['optimizer_args']['weight_decay']
        )
        criterion = torch.nn.CrossEntropyLoss(reduction='none')
        scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=total_epoch)

        for epoch in range(total_epoch):
            task_model.train()

            total_loss = 0
            n_batch = 0
            acc = 0

            for inputs, targets in train_loader:
                n_batch += 1
                inputs, targets = inputs.to(self.device), targets.to(self.device)

                optimizer.zero_grad()
                outputs = task_model(inputs)
                loss = criterion(outputs, targets)
                loss = torch.mean(loss)
                loss.backward()
                optimizer.step()

                total_loss += loss.item()
                predicted = outputs.argmax(1)
                b_acc = 1.0 * (targets == predicted).sum().item() / targets.shape[0]
                acc += b_acc

            total_loss /= n_batch
            acc /= n_batch

            if epoch % 50 == 0 or epoch == total_epoch-1:
                print('==========Inner epoch {:d} ========'.format(epoch))
                print('Training Loss {:.3f}'.format(total_loss))
                print('Training accuracy {:.3f}'.format(acc*100))
            scheduler.step()
        self.task_model.load_state_dict(task_model.state_dict())

    def predict(self, testset):
        loader_te = DataLoader(testset, shuffle=False, **self.kwargs['loader_te_args'])
        self.task_model.to(self.device)
        self.task_model.eval()

        test_num = len(testset.targets)
        batch_size = self.kwargs['loader_te_args']['batch_size']
        pred = np.zeros(test_num)
        with torch.no_grad():
            for idx, (x, y) in enumerate(loader_te):
                x, y = x.to(self.device), y.to(self.device)
                out = self.task_model(x)
                p = out.argmax(1)
                pred[idx*batch_size:(idx+1)*batch_size] = p.cpu().numpy()
        return pred

    def test_accu(self, testset):
        pred = self.predict(testset)
        label = np.array(testset.targets)
        return np.sum(pred == label) / float(label.shape[0])


if __name__ =="__main__":
    a=np.random.rand(200,10)
    b=np.random.rand(100,10)
    dists = find_closest_dists(a,b,k=1).squeeze(axis=1)
    print(dists.shape)  # (200,)
